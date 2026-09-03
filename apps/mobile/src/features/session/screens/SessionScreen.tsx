import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
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
  type SessionReplyLocale,
} from "@aura/contracts";
import { sessionsApi, turnsApi } from "../../../lib/api";
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
import { forceDarkStage, stageColors } from "../../../lib/theme";
import { voiceSocket } from "../../../lib/voice/voice-socket";
import { CircleAvatar } from "../../avatar";
import { ErrorBanner, NetworkEmpty } from "../../shared";
import { CallControls } from "../components/CallControls";
import { MicPermissionSheet } from "../components/MicPermissionSheet";
import { SessionCaption } from "../components/SessionCaption";
import { SafetyBanner } from "../safety";
import { Waveform } from "../components/Waveform";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: states.safety_mode = info_banner; PTT remains holdable (not disabled by showSafety)
// DESIGN-GATE: session force_dark #040d1a · circle_2d 168 · stage ~58% · PTT 80/88 · CTA mic/end 48
// DESIGN-GATE: R3F primary FORBIDDEN — CircleAvatar only on default Session path

type SessionScreenProps = {
  sessionId?: string;
  personaSlug?: PersonaSlug;
  /** Session reply locale from create — read-only chip (not a switch). */
  locale?: SessionReplyLocale;
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

function localeChipText(locale: SessionReplyLocale | undefined): string {
  return (locale ?? "vi").toUpperCase();
}

/**
 * Session presence — calling-UI circle avatar (ADR-0006) + overlay_minimal chrome +
 * waveform 36 + optional caption + CTA row (mic · PTT · End call).
 * Primary transport: Socket.IO `/v1/voice` with SP-4 **segment_m4a** uplink.
 * REST multipart is opt-in via `EXPO_PUBLIC_VOICE_REST_FALLBACK=1` only.
 */
export function SessionScreen({
  sessionId,
  personaSlug,
  locale = "vi",
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
  const [captionText, setCaptionText] = useState("");
  const [turnError, setTurnError] = useState<string | null>(null);
  const [micDeniedVisible, setMicDeniedVisible] = useState(false);
  const [micGranted, setMicGranted] = useState(true);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

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
  const ambientTint =
    personaSlug === "native-buddy"
      ? "rgba(139, 92, 246, 0.16)"
      : stageColors.accentMuted;
  const tintHairline =
    personaSlug === "native-buddy" ? "#8b5cf6" : stageColors.accent;

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
          }
          setCaptionText(e.text ?? "");
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
          chunkPlayer.setListeners({
            onPlaybackFinished: () => {
              if (!mounted.current) return;
              setUiState("idle");
              setAvatarCue("idle");
            },
          });
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
        setMicGranted(false);
        setMicDeniedVisible(true);
        return false;
      }
      setMicGranted(true);
      return true;
    } catch {
      setMicGranted(false);
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
          clientLocale: locale,
          clientTurnId: clientTurnIdRef.current ?? createClientTurnId(),
        });
        const turn = response.data;
        if (turn.safetyMode === "safe-listener") {
          setShowSafety(true);
          setSafetyResources(turn.safetyResources);
        }
        setCaptionText(turn.assistantText ?? "");
        setAvatarCue(turn.avatarCue);
        setUiState("talk");
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
    } catch {
      finishing.current = false;
      if (mounted.current) {
        setTurnError(sessionCopy.error_turn);
        setUiState("idle");
        setAvatarCue("idle");
      }
    } finally {
      clientTurnIdRef.current = null;
    }
  }, [flushFinalRecording, locale, recorder, sessionId, useRestFallback]);

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
      finishing.current ||
      ending
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
          clientLocale: locale,
          encoding: "segment_m4a",
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
    ending,
    ensureMicPermission,
    isOnline,
    locale,
    recorder,
    sessionId,
    uiState,
    useRestFallback,
  ]);

  const endCall = useCallback(async () => {
    if (ending) return;
    setEnding(true);
    holdActive.current = false;
    chunkPlayer.stop();
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      // ignore
    }
    try {
      if (sessionId && !isApiMockEnabled()) {
        await sessionsApi.endSession(sessionId);
      }
    } catch {
      // Still navigate away — hard-end UX; retry not required for MVP.
    } finally {
      if (mounted.current) {
        onBack?.();
      }
    }
  }, [ending, onBack, recorder, sessionId]);

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
      style={{ flex: 1, backgroundColor: stageColors.bg }}
      edges={["top", "bottom"]}
    >
      <StatusBar style={forceDarkStage.statusBarStyle} />

      <View style={{ flex: 1 }}>
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: "18%",
            alignSelf: "center",
            width: 280,
            height: 280,
            borderRadius: 9999,
            backgroundColor: ambientTint,
            opacity: 0.9,
          }}
        />

        {/* Circle stage ~58% (clamp 54–62) of content below overlay chrome */}
        <View
          style={{
            flexGrow: 0.58,
            flexShrink: 1,
            flexBasis: "58%",
            minHeight: 240,
            paddingTop: 56,
          }}
        >
          <CircleAvatar
            state={uiState}
            avatarCue={avatarCue}
            personaName={name}
            avatarAssetKey={personaSlug}
            tintColor={tintHairline}
          />
        </View>

        {/* overlay_minimal — back · persona/locale · status chip */}
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            gap: 8,
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
              width: 44,
              height: 44,
              borderRadius: 9999,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(10, 22, 40, 0.88)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
            }}
          >
            <Text
              style={{
                color: stageColors.text,
                fontSize: 18,
                fontWeight: "600",
                lineHeight: 22,
              }}
            >
              ←
            </Text>
          </Pressable>

          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minWidth: 0,
            }}
          >
            <Text
              style={{
                color: stageColors.text,
                fontSize: 17,
                fontWeight: "600",
                lineHeight: 22,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {name}
            </Text>
            <View
              testID="session-locale-chip"
              accessibilityLabel={sessionCopy.locale_chip_a11y.replace(
                "{locale}",
                localeChipText(locale),
              )}
              style={{
                height: 28,
                borderRadius: 9999,
                backgroundColor: "rgba(10, 22, 40, 0.88)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.08)",
                paddingHorizontal: 10,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: stageColors.textSecondary,
                  fontSize: 13,
                  fontWeight: "500",
                  lineHeight: 18,
                }}
              >
                {localeChipText(locale)}
              </Text>
            </View>
          </View>

          <View
            style={{
              height: 28,
              borderRadius: 9999,
              backgroundColor: "rgba(10, 22, 40, 0.88)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.08)",
              paddingHorizontal: 12,
              alignItems: "center",
              justifyContent: "center",
              maxWidth: 120,
            }}
          >
            <Text
              style={{
                color: stageColors.textSecondary,
                fontSize: 13,
                fontWeight: "500",
                lineHeight: 18,
              }}
              numberOfLines={1}
            >
              {chipLabel(uiState)}
            </Text>
          </View>
        </View>

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 220,
            backgroundColor: stageColors.vignette,
          }}
        />

        <View
          style={{
            paddingHorizontal: 20,
            paddingBottom: 16,
            paddingTop: 12,
          }}
        >
          {showSafety ? (
            <View style={{ marginBottom: 12 }}>
              <SafetyBanner
                resources={safetyResources}
                onDismiss={() => setShowSafety(false)}
              />
            </View>
          ) : null}

          <SessionCaption
            text={captionText}
            visible={uiState === "talk" && Boolean(captionText)}
          />

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

          <Waveform state={uiState} />

          <View style={{ marginTop: 16 }}>
            <CallControls
              state={uiState}
              disabled={!sessionId}
              ending={ending}
              micGranted={micGranted}
              onMicPress={() => {
                void ensureMicPermission();
              }}
              onPressIn={() => {
                void startHold();
              }}
              onPressOut={() => {
                void finishHold();
              }}
              onEndCall={() => {
                void endCall();
              }}
            />
          </View>
        </View>
      </View>

      <MicPermissionSheet
        visible={micDeniedVisible}
        onClose={() => setMicDeniedVisible(false)}
      />
    </SafeAreaView>
  );
}
