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
  type AvatarCue,
  type PersonaSlug,
  type SafetyResource,
  type TurnResponseData,
} from "@aura/contracts";
import { turnsApi } from "../../../lib/api";
import { playTurnAudio } from "../../../lib/audio/play-turn-audio";
import { isApiMockEnabled } from "../../../lib/config";
import { createClientTurnId } from "../../../lib/id";
import { homeCopy, sessionCopy } from "../../../lib/i18n";
import { useNetworkStatus } from "../../../lib/network/useNetworkStatus";
import { ErrorBanner, NetworkEmpty, SafetyBanner } from "../../shared";
import { AvatarPlaceholder } from "../components/AvatarPlaceholder";
import { MicPermissionSheet } from "../components/MicPermissionSheet";
import { PttButton } from "../components/PttButton";
import { Waveform } from "../components/Waveform";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

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

function mockTurn(sessionId: string): TurnResponseData {
  return {
    turnId: createClientTurnId(),
    sessionId,
    clientTurnId: createClientTurnId(),
    userTranscript: "",
    assistantText: "",
    audioUrl: "mock://silent",
    provider: { stt: "mock", chat: "mock", tts: "mock" },
    avatarCue: "talk",
    safetyMode: "normal",
    latencyMs: 120,
  };
}

/**
 * Session presence — avatar stage (~58%) + waveform + PTT hold-to-talk.
 * States: idle | listen | talk | recording | processing.
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
  const playbackAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const finishHoldRef = useRef<() => Promise<void>>(async () => undefined);

  const name = useMemo(() => personaLabel(personaSlug), [personaSlug]);

  useEffect(() => {
    mounted.current = true;
    void setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });
    return () => {
      mounted.current = false;
      playbackAbort.current?.abort();
      try {
        if (recorder.isRecording) {
          void recorder.stop();
        }
      } catch {
        // ignore
      }
    };
  }, [recorder]);

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
      // User released before async start finished — mark for immediate stop.
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

    let audioUri: string | null = null;
    let durationMs = 0;
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
      audioUri = recorder.uri;
      if (recordingStartedAt.current) {
        durationMs = Math.min(
          Date.now() - recordingStartedAt.current,
          TURN_AUDIO_MAX_DURATION_MS,
        );
      }
    } catch {
      // fall through
    }
    recordingStartedAt.current = null;

    if (!audioUri && !isApiMockEnabled()) {
      finishing.current = false;
      if (mounted.current) {
        setTurnError(sessionCopy.error_turn);
        setUiState("idle");
        setAvatarCue("idle");
      }
      return;
    }

    try {
      let turn: TurnResponseData;
      if (isApiMockEnabled()) {
        await new Promise((r) => setTimeout(r, 400));
        turn = mockTurn(sessionId);
      } else {
        const response = await turnsApi.uploadTurn(sessionId, {
          audioUri: audioUri!,
          mimeType: "audio/m4a",
          fileName: "turn.m4a",
          clientDurationMs: durationMs || undefined,
          clientLocale: "vi",
          clientTurnId: createClientTurnId(),
        });
        turn = response.data;
      }

      if (!mounted.current) {
        finishing.current = false;
        return;
      }

      if (turn.safetyMode === "safe-listener") {
        setShowSafety(true);
        setSafetyResources(turn.safetyResources);
      }

      setAvatarCue(turn.avatarCue);
      setUiState("talk");

      if (isApiMockEnabled() || turn.audioUrl.startsWith("mock://")) {
        await new Promise((r) => setTimeout(r, 900));
      } else {
        playbackAbort.current?.abort();
        playbackAbort.current = new AbortController();
        await playTurnAudio(turn.audioUrl, {
          signal: playbackAbort.current.signal,
        });
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
    }
  }, [recorder, sessionId]);

  finishHoldRef.current = finishHold;

  // Cap client duration ~60s (SP-3).
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

    // Finger already lifted while permission dialog was up.
    if (releaseRequested.current) {
      releaseRequested.current = false;
      return;
    }

    try {
      playbackAbort.current?.abort();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();

      if (releaseRequested.current) {
        releaseRequested.current = false;
        return;
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
  }, [ensureMicPermission, isOnline, recorder, sessionId, uiState]);

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
            playbackAbort.current?.abort();
            holdActive.current = false;
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
