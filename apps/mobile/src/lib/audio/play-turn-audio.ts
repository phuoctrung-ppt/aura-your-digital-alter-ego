import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import { getApiBaseUrl } from "../config";
import { tokenStore } from "../session/token-store";

function toAbsoluteAudioUrl(audioUrl: string): string {
  if (/^https?:\/\//i.test(audioUrl)) {
    return audioUrl;
  }
  const path = audioUrl.startsWith("/") ? audioUrl : `/${audioUrl}`;
  return `${getApiBaseUrl()}${path}`;
}

/**
 * Play assistant TTS from TurnResponse.audioUrl.
 * Relative API paths need Bearer (GET /v1/sessions/:id/turns/:turnId/audio).
 * Resolves when playback finishes or on error (never throws to callers).
 */
export async function playTurnAudio(
  audioUrl: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  let player: AudioPlayer | undefined;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    });

    const token = await tokenStore.getAccessToken();
    const uri = toAbsoluteAudioUrl(audioUrl);
    player = createAudioPlayer(
      {
        uri,
        headers: token
          ? { Authorization: `Bearer ${token}` }
          : undefined,
      },
      { updateInterval: 250 },
    );

    const activePlayer = player;

    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      if (opts?.signal?.aborted) {
        done();
        return;
      }

      const onAbort = () => {
        try {
          activePlayer.pause();
        } catch {
          // ignore
        }
        done();
      };
      opts?.signal?.addEventListener("abort", onAbort, { once: true });

      const sub = activePlayer.addListener(
        "playbackStatusUpdate",
        (status) => {
          if (status.didJustFinish) {
            try {
              sub.remove();
            } catch {
              // ignore
            }
            done();
          }
        },
      );

      try {
        activePlayer.play();
      } catch {
        try {
          sub.remove();
        } catch {
          // ignore
        }
        done();
        return;
      }

      // Safety timeout — avoid hanging forever if finish event is missed.
      setTimeout(() => {
        try {
          sub.remove();
        } catch {
          // ignore
        }
        done();
      }, 90_000);
    });
  } catch {
    // Playback failures are soft — session returns to idle.
  } finally {
    try {
      player?.remove();
    } catch {
      // ignore
    }
  }
}
