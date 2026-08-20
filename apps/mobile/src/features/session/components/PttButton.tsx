import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { sessionCopy } from "../../../lib/i18n";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type PttButtonProps = {
  state: SessionUiState;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
};

/**
 * Push-to-talk — visual 80 / hit 88, bottom_center primary CTA.
 * Recording = accent fill; processing = info ring + spinner.
 */
export function PttButton({
  state,
  onPressIn,
  onPressOut,
  disabled,
}: PttButtonProps) {
  const busy = state === "processing";
  const recording = state === "recording";
  const talking = state === "talk";

  let ringColor = "#33415C";
  let fillColor = "#141C2E";
  if (recording) {
    ringColor = "#2DD4BF";
    fillColor = "#2DD4BF";
  } else if (busy) {
    ringColor = "#38BDF8";
    fillColor = "#141C2E";
  } else if (talking) {
    ringColor = "#33415C";
    fillColor = "#1B2538";
  }

  return (
    <View style={{ alignItems: "center" }}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled || busy || talking}
        accessibilityRole="button"
        accessibilityLabel={sessionCopy.ptt_a11y}
        accessibilityState={{
          disabled: disabled || busy || talking,
          busy,
        }}
        hitSlop={4}
        style={{
          width: 88,
          height: 88,
          borderRadius: 9999,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 9999,
            borderWidth: 2,
            borderColor: ringColor,
            backgroundColor: fillColor,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.4 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#38BDF8" />
          ) : (
            <Text
              style={{
                color: recording ? "#042F2E" : "#F5F7FA",
                fontSize: 13,
                fontWeight: "600",
                lineHeight: 18,
              }}
            >
              {recording ? "REC" : "MIC"}
            </Text>
          )}
        </View>
      </Pressable>
      <Text
        style={{
          marginTop: 12,
          color: "#A8B3C7",
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {sessionCopy.ptt_label}
      </Text>
    </View>
  );
}
