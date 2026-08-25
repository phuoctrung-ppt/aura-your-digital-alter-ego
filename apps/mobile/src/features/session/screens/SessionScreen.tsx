import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import {
  TURN_AUDIO_MAX_DURATION_MS,
  VOICE_AUDIO_MAX_FRAME_BYTES,
  type AvatarCue,
  type PersonaSlug,
  type SafetyResource,
} from "@aura/contracts";
import { turnsApi } from "../../../lib/api";
import { arrayBufferToBase64, readUriAsArrayBuffer } from "../../../lib/audio/audio-utils";
import { chunkPlayer } from "../../../lib/audio/chunk-player";
import { playTurnAudio } from "../../../lib/audio/play-turn-audio";
import {
  isApiMockEnabled,
  isVoiceRestFallbackEnabled,
} from "../../../lib/config";
import { createClientTurnId } from "../../../lib/id";
import { personaLabel, sessionCopy } from "../../../lib/i18n";
import { useNetworkStatus } from "../../../lib/network/useNetworkStatus";
import { voiceSocket } from "../../../lib/voice/voice-socket";
import { AvatarStage } from "../../avatar";
import { ErrorBanner, NetworkEmpty } from "../../shared";
import { MicPermissionSheet } from "../components/MicPermissionSheet";
import { PttButton } from "../components/PttButton";
import { SafetyBanner } from "../safety";
import { Waveform } from "../components/Waveform";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: states.safety_mode = info_banner; PTT remains holdable (not disabled by showSafety)

type SessionScreenProps = {
  sessionId?: string;
  personaSlug?: PersonaSlug;
  onBack?: () => void;
};

function chipLabel(state: SessionUiState): string {
  switch (state) {
    case "listen":
      return sessionCopy.chip.listen;
    case "talk":
      return sessionCopy.chip.talk;
    case "recording":
      return sessionCopy.chip.recording;
    case "processing":
      return sessionCopy.chip.processing;
    case "idle":
    default:
      return sessionCopy.chip.idle;
  }
}

/**
 * Session presence — avatar stage (~58%) + waveform + PTT hold-to-talk.
 * Primary transport: Socket.IO `/v1/voice` with SP-4 **segment_m4a** uplink —
 * one continuous HIGH_QUALITY recording for the whole hold, stopped once on
 * release, then chunked into ≤64 KiB `audio.frame`s (server concatenates
 * before decode). Native = AAC-in-MP4 `.m4a`; **Expo web** MediaRecorder emits
 * `audio/webm` under the same wire encoding — API sniffs EBML and decodes as
 * WebM (no `moov`). Rolling stop/restart was abandoned: short native clips
 * often lack a `moov` atom and Speech v1 cannot ingest AAC/M4A without a
 * complete container + ffmpeg. REST multipart is opt-in via
 * `EXPO_PUBLIC_VOICE_REST_FALLBACK=1` only.
 */
export function SessionScreen({
  sessionId,
  personaSlug,
  onBack,
}: SessionScreenProps) {
  const { isOnline, refresh: refreshNetwork } = useNetworkStatus();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const [uiState, setUiState] = useState<SessionUiState>("idle");
  const [avatarCue, setAvatarCue] = useState<AvatarCue>("idle");
  const [showSafety, setShowSafety] = useState(false);
  const [safetyResources, setSafetyResources] = useState<
    SafetyResource[] | undefined
  >(undefined);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [micDeniedVisible, setMicDeniedVisible] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const recordingStartedAt = useRef<number | null>(null);
  const holdActive = useRef(false);
  const releaseRequested = useRef(false);
  const finishing = useRef(false);
  const mounted = useRef(true);
  const finishHoldRef = useRef<() => Promise<void>>(async () => undefined);
  const clientTurnIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef(-1);
  const flushBusy = useRef(false);
  const useRestFallback = isVoiceRestFallbackEnabled();

  const name = useMemo(() => personaLabel(personaSlug), [personaSlug]);

  /**
   * Read a finalized recorder URI and emit as one or more `segment_m4a` frames.
   * Long holds exceed `VOICE_AUDIO_MAX_FRAME_BYTES` — chunk the same file; the
   * API concatenates frames before moov/ffmpeg decode.
   */
  const emitFinalizedRecording = useCallback(
    async (uri: string): Promise<boolean> => {
      const clientTurnId = clientTurnIdRef.current;
      if (!clientTurnId) return false;

      const buffer = await readUriAsArrayBuffer(uri);
      if (!buffer.byteLength) return false;

      const bytes = new Uint8Array(buffer);
      let offset = 0;
      let sent = 0;
      while (offset < bytes.length) {
        const end = Math.min(offset + VOICE_AUDIO_MAX_FRAME_BYTES, bytes.length);
        const slice = bytes.subarray(offset, end);
        const sliceBuffer = slice.buffer.slice(
          slice.byteOffset,
          slice.byteOffset + slice.byteLength,
        );
        lastSeqRef.current += 1;
        voiceSocket.sendFrame({
          clientTurnId,
          seq: lastSeqRef.current,
          payloadBase64: arrayBufferToBase64(sliceBuffer),
          byteLength: slice.byteLength,
          isLast: end >= bytes.length,
        });
        sent += 1;
        offset = end;
      }
      return sent > 0;
    },
    [],
  );

  /** Stop the single hold recording and stream the complete m4a over WSS. */
  const flushFinalRecording = useCallback(async (): Promise<boolean> => {
    if (flushBusy.current) return false;
    flushBusy.current = true;
    try {
      let uri: string | null = null;
      try {
        if (recorder.isRecording) {
          await recorder.stop();
        }
        uri = recorder.uri;
      } catch {
        uri = null;
      }
      if (!uri) return false;
      try {
        return await emitFinalizedRecording(uri);
      } catch {
        return false;
      }
    } finally {
      flushBusy.current = false;
    }
  }, [emitFinalizedRecording, recorder]);

  useEffect(() => {
    mounted.current = true;
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    if (!useRestFallback && !isApiMockEnabled()) {
      void voiceSocket.connect({
        onAssistantText: (e) => {
          if (!mounted.current) return;
          if (e.safetyMode === "safe-listener") {
            setShowSafety(true);
            // resources arrive on turn.done; keep banner visible early
          }
          setAvatarCue(e.avatarCue ?? "talk");
          setUiState("talk");
        },
        onTtsChunk: (e) => {
          if (!mounted.current) return;
          setUiState("talk");
          setAvatarCue("talk");
          void chunkPlayer.addChunk({
            seq: e.seq,
            payloadBase64: e.payloadBase64,
            mime: e.mime,
          });
        },
        onTurnDone: (e) => {
          if (!mounted.current) return;
          finishing.current = false;
          if (e.safetyMode === "safe-listener") {
            setShowSafety(true);
            setSafetyResources(e.safetyResources);
          }
          setAvatarCue(e.avatarCue ?? "talk");
          // Stay in talk until chunk queue drains; idle when playback finishes.
          chunkPlayer.setListeners({
            onPlaybackFinished: () => {
              if (!mounted.current) return;
              setUiState("idle");
              setAvatarCue("idle");
            },
          });
          // If no chunks were queued, return to idle immediately.
          if (e.audioUrl === undefined) {
            // chunks may still be playing; listener handles idle
          }
        },
        onError: (e) => {
          if (!mounted.current) return;
          finishing.current = false;
          setTurnError(e.message || sessionCopy.error_turn);
          setUiState("idle");
          setAvatarCue("idle");
        },
      });
    }

    return () => {
      mounted.current = false;
      chunkPlayer.stop();
      voiceSocket.disconnect();
      try {
        if (recorder.isRecording) {
          void recorder.stop();
        }
      } catch {
        // ignore
      }
    };
  }, [recorder, useRestFallback]);

  const ensureMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await requestRecordingPermissionsAsync();
      if (!result.granted) {
        setMicDeniedVisible(true);
        return false;
      }
      return true;
    } catch {
      setMicDeniedVisible(true);
      return false;
    }
  }, []);

  const finishHold = useCallback(async () => {
    if (finishing.current) return;
    if (!holdActive.current) {
      releaseRequested.current = true;
      return;
    }

    finishing.current = true;
    holdActive.current = false;
    releaseRequested.current = false;

    if (!sessionId) {
      finishing.current = false;
      setUiState("idle");
      setAvatarCue("idle");
      setConnectError(sessionCopy.error_connect);
      return;
    }

    setUiState("processing");
    setAvatarCue("listen");

    const startedAt = recordingStartedAt.current;
    const durationMs = startedAt
      ? Math.min(Date.now() - startedAt, TURN_AUDIO_MAX_DURATION_MS)
      : 0;
    recordingStartedAt.current = null;

    // Mock UI path — no socket / REST.
    if (isApiMockEnabled()) {
      try {
        if (recorder.isRecording) await recorder.stop();
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, 400));
      if (mounted.current) {
        setAvatarCue("talk");
        setUiState("talk");
      }
      await new Promise((r) => setTimeout(r, 900));
      if (mounted.current) {
        setUiState("idle");
        setAvatarCue("idle");
      }
      finishing.current = false;
      clientTurnIdRef.current = null;
      lastSeqRef.current = -1;
      return;
    }

    // Opt-in REST multipart fallback (degraded clients / CI).
    if (useRestFallback) {
      let audioUri: string | null = null;
      try {
        if (recorder.isRecording) await recorder.stop();
        audioUri = recorder.uri;
      } catch {
        audioUri = null;
      }
      if (!audioUri) {
        finishing.current = false;
        if (mounted.current) {
          setTurnError(sessionCopy.error_turn);
          setUiState("idle");
          setAvatarCue("idle");
        }
        return;
      }
      try {
        const response = await turnsApi.uploadTurn(sessionId, {
          audioUri,
          mimeType: "audio/m4a",
          fileName: "turn.m4a",
          clientDurationMs: durationMs || undefined,
          clientLocale: "vi",
          clientTurnId: clientTurnIdRef.current ?? createClientTurnId(),
        });
        const turn = response.data;
        if (turn.safetyMode === "safe-listener") {
          setShowSafety(true);
          setSafetyResources(turn.safetyResources);
        }
        setAvatarCue(turn.avatarCue);
        setUiState("talk");
        // REST returns a single audioUrl — publish via playTurnAudio registry for lip-sync.
        if (turn.audioUrl) {
          await playTurnAudio(turn.audioUrl);
        } else {
          await new Promise((r) => setTimeout(r, 400));
        }
        if (mounted.current) {
          setUiState("idle");
          setAvatarCue("idle");
        }
      } catch {
        if (mounted.current) {
          setTurnError(sessionCopy.error_turn);
          setUiState("idle");
          setAvatarCue("idle");
        }
      } finally {
        finishing.current = false;
        clientTurnIdRef.current = null;
        lastSeqRef.current = -1;
      }
      return;
    }

    // Primary WSS path: stop the single hold recording, stream it as one or
    // more `segment_m4a` frames, then turn.end. Server concatenates frames
    // before ffmpeg decode (complete m4a needed for moov).
    try {
      await flushFinalRecording();
      const clientTurnId = clientTurnIdRef.current;
      if (!clientTurnId) {
        throw new Error("missing clientTurnId");
      }
      voiceSocket.endTurn({
        clientTurnId,
        clientDurationMs: durationMs || undefined,
        lastSeq: lastSeqRef.current,
      });
      // UI stays in processing until assistant.text / tts.chunk / turn.done.
    } catch {
      finishing.current = false;
      if (mounted.current) {
        setTurnError(sessionCopy.error_turn);
        setUiState("idle");
        setAvatarCue("idle");
      }
    } finally {
      clientTurnIdRef.current = null;
      // keep lastSeq until next startHold resets it
    }
  }, [flushFinalRecording, recorder, sessionId, useRestFallback]);

  finishHoldRef.current = finishHold;

  useEffect(() => {
    if (
      uiState === "recording" &&
      recorderState.durationMillis >= TURN_AUDIO_MAX_DURATION_MS
    ) {
      void finishHoldRef.current();
    }
  }, [recorderState.durationMillis, uiState]);

  const startHold = useCallback(async () => {
    if (!sessionId) {
      setConnectError(sessionCopy.error_connect);
      return;
    }
    if (
      uiState === "processing" ||
      uiState === "talk" ||
      uiState === "recording" ||
      finishing.current
    ) {
      return;
    }
    if (isOnline === false) {
      return;
    }

    setTurnError(null);
    setConnectError(null);
    releaseRequested.current = false;

    const granted = await ensureMicPermission();
    if (!granted) return;

    if (releaseRequested.current) {
      releaseRequested.current = false;
      return;
    }

    try {
      chunkPlayer.stop();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();

      if (releaseRequested.current) {
        releaseRequested.current = false;
        return;
      }

      const clientTurnId = createClientTurnId();
      clientTurnIdRef.current = clientTurnId;
      lastSeqRef.current = -1;

      if (!useRestFallback && !isApiMockEnabled()) {
        voiceSocket.startTurn({
          sessionId,
          clientTurnId,
          clientLocale: "vi",
          encoding: "segment_m4a",
          // Required on wire type after Zod defaults; ignored for segment encodings.
          sampleRateHz: 16_000,
          channels: 1,
        });
      }

      // One continuous recording for the whole hold — finalize once on release.
      // Rolling stop/restart produced incomplete MP4s (no moov) that Speech
      // could not decode, and the server only runs STT at turn.end anyway.
      recorder.record({ forDuration: TURN_AUDIO_MAX_DURATION_MS / 1000 });
      recordingStartedAt.current = Date.now();
      holdActive.current = true;
      if (mounted.current) {
        setUiState("recording");
        setAvatarCue("listen");
      }

      if (releaseRequested.current) {
        await finishHoldRef.current();
      }
    } catch {
      holdActive.current = false;
      if (mounted.current) {
        setTurnError(sessionCopy.error_turn);
        setUiState("idle");
        setAvatarCue("idle");
      }
    }
  }, [
    ensureMicPermission,
    isOnline,
    recorder,
    sessionId,
    uiState,
    useRestFallback,
  ]);

  if (isOnline === false) {
    return (
      <NetworkEmpty
        onRetry={() => {
          void refreshNetwork();
        }}
      />
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B1220" }}
      edges={["top", "bottom"]}
    >
      <View
        style={{
          height: 56,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          onPress={() => {
            holdActive.current = false;
            chunkPlayer.stop();
            onBack?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={sessionCopy.back_a11y}
          style={{
            height: 44,
            minWidth: 44,
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#2DD4BF",
              fontSize: 16,
              fontWeight: "600",
              lineHeight: 20,
            }}
          >
            ←
          </Text>
        </Pressable>
        <Text
          style={{
            color: "#F5F7FA",
            fontSize: 16,
            fontWeight: "400",
            lineHeight: 24,
          }}
        >
          {name}
        </Text>
        <View style={{ minWidth: 44 }} />
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 16 }}>
        {showSafety ? (
          <View style={{ marginBottom: 12 }}>
            <SafetyBanner
              resources={safetyResources}
              onDismiss={() => setShowSafety(false)}
            />
          </View>
        ) : null}

        {turnError ? (
          <ErrorBanner
            message={turnError}
            onRetry={() => setTurnError(null)}
          />
        ) : null}

        {connectError ? (
          <ErrorBanner
            message={connectError}
            onRetry={() => setConnectError(null)}
          />
        ) : null}

        {!sessionId ? (
          <ErrorBanner message={sessionCopy.error_connect} />
        ) : null}

        <View
          style={{
            alignSelf: "center",
            borderRadius: 9999,
            backgroundColor: "#141C2E",
            borderWidth: 1,
            borderColor: "#243047",
            paddingHorizontal: 12,
            paddingVertical: 4,
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: "#A8B3C7",
              fontSize: 13,
              fontWeight: "500",
              lineHeight: 18,
            }}
          >
            {chipLabel(uiState)}
          </Text>
        </View>

        <View
          style={{
            flexGrow: 0.58,
            flexShrink: 1,
            flexBasis: "58%",
            marginBottom: 16,
          }}
        >
          <AvatarStage
            state={uiState}
            personaName={name}
            avatarCue={avatarCue}
            avatarAssetKey={personaSlug}
            degraded={process.env.EXPO_PUBLIC_AVATAR_DEGRADED === "1"}
          />
        </View>

        <Waveform state={uiState} />

        <View
          style={{
            marginTop: 24,
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <PttButton
            state={uiState}
            disabled={!sessionId}
            onPressIn={() => {
              void startHold();
            }}
            onPressOut={() => {
              void finishHold();
            }}
          />
        </View>
      </View>

      <MicPermissionSheet
        visible={micDeniedVisible}
        onClose={() => setMicDeniedVisible(false)}
      />
    </SafeAreaView>
  );
}
