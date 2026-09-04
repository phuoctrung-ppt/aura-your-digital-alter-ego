import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { sessionCopy } from "../../../lib/i18n";
import { stageColors } from "../../../lib/theme";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: PTT visual 80 / hit 88 · bottom_center · reduced-motion kills glow/ping

type PttButtonProps = {
  state: SessionUiState;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
};

/**
 * Push-to-talk — visual 80 / hit 88, bottom_center primary CTA.
 * Recording = accent fill + optional glow (killed under reduced-motion).
 * Idle/recording outer ping rings (~100 / ~114) — static or opacity only;
 * killed under reduceMotion. Processing = info ring + spinner.
 * Stage force_dark tokens only. No violet/pink CTA fill.
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
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  let ringColor = stageColors.pttRingIdle;
  let fillColor = stageColors.pttIdleFill;
  if (recording) {
    ringColor = stageColors.accent;
    fillColor = stageColors.accent;
  } else if (busy) {
    ringColor = stageColors.info;
    fillColor = stageColors.elevated;
  } else if (talking) {
    ringColor = stageColors.pttRingIdle;
    fillColor = stageColors.elevated;
  }

  const showGlow = recording && !reduceMotion;
  const showPing = !reduceMotion && !busy && !talking;
  const pingInner = recording ? "rgba(0, 229, 255, 0.55)" : "rgba(0, 229, 255, 0.22)";
  const pingOuter = recording ? "rgba(0, 229, 255, 0.28)" : "rgba(0, 229, 255, 0.12)";
  const faceColor = recording ? stageColors.textOnAccent : stageColors.text;

  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width: 114,
          height: 114,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {showPing ? (
          <>
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 114,
                height: 114,
                borderRadius: 9999,
                borderWidth: 1,
                borderColor: pingOuter,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                width: 100,
                height: 100,
                borderRadius: 9999,
                borderWidth: 1.5,
                borderColor: pingInner,
              }}
            />
          </>
        ) : null}

        <Pressable
          testID="ptt-button"
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={disabled || busy || talking}
          accessibilityRole="button"
          accessibilityLabel={sessionCopy.ptt_a11y}
          accessibilityState={{
            disabled: disabled || busy || talking,
            busy,
          }}
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
              shadowColor: showGlow ? stageColors.accent : "transparent",
              shadowOpacity: showGlow ? 0.55 : 0,
              shadowRadius: showGlow ? 16 : 0,
              shadowOffset: { width: 0, height: 0 },
              elevation: showGlow ? 8 : 0,
            }}
          >
            {busy ? (
              <ActivityIndicator color={stageColors.info} />
            ) : (
              <Text
                style={{
                  color: faceColor,
                  fontSize: 28,
                  fontWeight: "600",
                  lineHeight: 32,
                }}
              >
                🎙
              </Text>
            )}
          </View>
        </Pressable>
      </View>
      <Text
        style={{
          marginTop: 4,
          color: stageColors.text,
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {recording ? sessionCopy.ptt_recording : sessionCopy.ptt_label}
      </Text>
    </View>
  );
}
