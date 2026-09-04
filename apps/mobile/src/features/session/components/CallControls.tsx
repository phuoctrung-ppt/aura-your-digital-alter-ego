import { Pressable, Text, View } from "react-native";
import { sessionCopy } from "../../../lib/i18n";
import { stageColors } from "../../../lib/theme";
import type { SessionUiState } from "../types";
import { PttButton } from "./PttButton";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: CTA row mic 48 · PTT 80/88 · end 48 · gap 24 · height ~112

type CallControlsProps = {
  state: SessionUiState;
  disabled?: boolean;
  ending?: boolean;
  /** Mic permission granted — ghost glass affordance only (not a second PTT). */
  micGranted?: boolean;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onMicPress?: () => void;
  onEndCall?: () => void;
};

/**
 * Bottom thumb-zone CTA row: mic affordance · PTT · End call.
 * Accent fill only on PTT recording. End call = danger outline (not primary).
 */
export function CallControls({
  state,
  disabled,
  ending,
  micGranted = true,
  onPressIn,
  onPressOut,
  onMicPress,
  onEndCall,
}: CallControlsProps) {
  const endDisabled = Boolean(disabled || ending);

  return (
    <View
      style={{
        minHeight: 112,
        maxHeight: 120,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "center",
        gap: 24,
        paddingTop: 4,
      }}
    >
      <View style={{ alignItems: "center", width: 64 }}>
        <Pressable
          testID="session-mic-affordance"
          onPress={onMicPress}
          accessibilityRole="button"
          accessibilityLabel={sessionCopy.mic_affordance_a11y}
          accessibilityState={{ disabled: !micGranted }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 9999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(10, 22, 40, 0.72)",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.08)",
            opacity: micGranted ? 1 : 0.55,
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
            {micGranted ? "🎙" : "🔇"}
          </Text>
        </Pressable>
        <Text
          style={{
            marginTop: 6,
            color: stageColors.textSecondary,
            fontSize: 12,
            fontWeight: "400",
            lineHeight: 16,
          }}
          numberOfLines={1}
        >
          Micro
        </Text>
      </View>

      <View style={{ alignItems: "center" }}>
        <PttButton
          state={state}
          disabled={disabled || ending}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        />
      </View>

      <View style={{ alignItems: "center", width: 64 }}>
        <Pressable
          testID="session-end-call"
          onPress={onEndCall}
          disabled={endDisabled}
          accessibilityRole="button"
          accessibilityLabel={sessionCopy.end_call_a11y}
          accessibilityState={{ disabled: endDisabled, busy: ending }}
          style={{
            width: 48,
            height: 48,
            borderRadius: 9999,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "transparent",
            borderWidth: 1.5,
            borderColor: "#F87171",
            opacity: endDisabled ? 0.4 : ending ? 0.7 : 1,
          }}
        >
          <Text
            style={{
              color: "#F87171",
              fontSize: 18,
              fontWeight: "700",
              lineHeight: 22,
            }}
          >
            ✕
          </Text>
        </Pressable>
        <Text
          style={{
            marginTop: 6,
            color: stageColors.text,
            fontSize: 13,
            fontWeight: "500",
            lineHeight: 18,
          }}
          numberOfLines={1}
        >
          {ending ? sessionCopy.ending : sessionCopy.end_call}
        </Text>
      </View>
    </View>
  );
}
