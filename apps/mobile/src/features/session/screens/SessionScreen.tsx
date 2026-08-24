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
import {
  isApiMockEnabled,
  isVoiceRestFallbackEnabled,
} from "../../../lib/config";
import { createClientTurnId } from "../../../lib/id";
import { homeCopy, sessionCopy } from "../../../lib/i18n";
import { useNetworkStatus } from "../../../lib/network/useNetworkStatus";
import { voiceSocket } from "../../../lib/voice/voice-socket";
import { ErrorBanner, NetworkEmpty, SafetyBanner } from "../../shared";
import { AvatarPlaceholder } from "../components/AvatarPlaceholder";
import { MicPermissionSheet } from "../components/MicPermissionSheet";
import { PttButton } from "../components/PttButton";
import { Waveform } from "../components/Waveform";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/** Rolling segment length for SP-4 hybrid uplink (expo-audio has no live PCM callback). */
const HYBRID_SEGMENT_MS = 1500;

type SessionScreenProps = {
  sessionId?: string;
  personaSlug?: PersonaSlug;
  onBack?: () => void;
};

function personaLabel(slug: PersonaSlug | undefined): string {
  if (slug === "native-buddy") {
    return homeCopy.persona.native_buddy.name;
  }
  if (slug === "tough-interviewer") {
    return homeCopy.persona.tough_interviewer.name;
  }
  return "Aura";
}

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
 * Primary transport: Socket.IO `/v1/voice` with SP-4 **segment_m4a** hybrid uplink
 * (rolling short clips while held; finalize on release). REST multipart is opt-in
 * via `EXPO_PUBLIC_VOICE_REST_FALLBACK=1` only.
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
  const segmentTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentBusy = useRef(false);
  const useRestFallback = isVoiceRestFallbackEnabled();

  const name = useMemo(() => personaLabel(personaSlug), [personaSlug]);

  const clearSegmentTimer = useCallback(() => {
    if (segmentTimerRef.current) {
      clearInterval(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
  }, []);

  const emitSegmentFromUri = useCallback(
    async (uri: string, isLast: boolean): Promise<boolean> => {
      const clientTurnId = clientTurnIdRef.current;
      if (!clientTurnId) return false;

      const buffer = await readUriAsArrayBuffer(uri);
      if (!buffer.byteLength) return false;

      // Contract cap per frame — drop oversize segment rather than violate Zod.
      if (buffer.byteLength > VOICE_AUDIO_MAX_FRAME_BYTES) {
        return false;
      }

      lastSeqRef.current += 1;
      voiceSocket.sendFrame({
        clientTurnId,
        seq: lastSeqRef.current,
        payloadBase64: arrayBufferToBase64(buffer),
        byteLength: buffer.byteLength,
        isLast,
      });
      return true;
    },
    [],
  );

  /** Stop current clip, stream bytes as one `segment_m4a` frame, optionally restart. */
  const rotateHybridSegment = useCallback(
    async (opts: { restart: boolean; isLast: boolean }): Promise<void> => {
      if (segmentBusy.current) return;
      segmentBusy.current = true;
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

        if (uri) {
          try {
            await emitSegmentFromUri(uri, opts.isLast);
          } catch {
            // Segment read/send failed — continue; endTurn still finalizes what arrived.
          }
        }

        if (opts.restart && holdActive.current && !releaseRequested.current) {
          await recorder.prepareToRecordAsync();
          if (!holdActive.current || releaseRequested.current) return;
          recorder.record({
            forDuration: TURN_AUDIO_MAX_DURATION_MS / 1000,
          });
        }
      } finally {
        segmentBusy.current = false;
      }
    },
    [emitSegmentFromUri, recorder],
  );

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
          clearSegmentTimer();
          setTurnError(e.message || sessionCopy.error_turn);
          setUiState("idle");
          setAvatarCue("idle");
        },
      });
    }

    return () => {
      mounted.current = false;
      clearSegmentTimer();
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
  }, [clearSegmentTimer, recorder, useRestFallback]);

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
    clearSegmentTimer();

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
        // REST returns a single audioUrl — chunk player unused on this path.
        await new Promise((r) => setTimeout(r, 900));
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

    // Primary WSS path: flush final hybrid segment, then turn.end.
    try {
      await rotateHybridSegment({ restart: false, isLast: true });
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
  }, [
    clearSegmentTimer,
    recorder,
    rotateHybridSegment,
    sessionId,
    useRestFallback,
  ]);

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

      recorder.record({ forDuration: TURN_AUDIO_MAX_DURATION_MS / 1000 });
      recordingStartedAt.current = Date.now();
      holdActive.current = true;
      if (mounted.current) {
        setUiState("recording");
        setAvatarCue("listen");
      }

      // SP-4 hybrid: roll short m4a segments over WSS while PTT is held.
      if (!useRestFallback && !isApiMockEnabled()) {
        clearSegmentTimer();
        segmentTimerRef.current = setInterval(() => {
          if (!holdActive.current) return;
          void rotateHybridSegment({ restart: true, isLast: false });
        }, HYBRID_SEGMENT_MS);
      }

      if (releaseRequested.current) {
        await finishHoldRef.current();
      }
    } catch {
      holdActive.current = false;
      clearSegmentTimer();
      if (mounted.current) {
        setTurnError(sessionCopy.error_turn);
        setUiState("idle");
        setAvatarCue("idle");
      }
    }
  }, [
    clearSegmentTimer,
    ensureMicPermission,
    isOnline,
    recorder,
    rotateHybridSegment,
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
            clearSegmentTimer();
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
          <AvatarPlaceholder
            state={uiState}
            personaName={name}
            avatarCue={avatarCue}
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
