import { View } from "react-native";
import { stageColors } from "../../../lib/theme";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: waveform height 36 · bar 3 / gap 2 · denser free bars (~24)

type WaveformProps = {
  state: SessionUiState;
};

/** Envelope heights — taller center, free bars (no meter track box). */
const BAR_HEIGHTS = [
  0.22, 0.35, 0.48, 0.62, 0.78, 0.9, 0.72, 0.55, 0.68, 0.85, 0.95, 0.8, 0.6,
  0.74, 0.88, 0.7, 0.52, 0.64, 0.46, 0.38, 0.28, 0.42, 0.58, 0.34,
];

/**
 * Decorative waveform — height 36, bar 3 / gap 2.
 * Active during talk/recording/processing (accent); idle uses waveform-idle.
 * Transparent track to match CallScreen free bars. Always stage (force_dark).
 */
export function Waveform({ state }: WaveformProps) {
  const active =
    state === "talk" || state === "recording" || state === "processing";

  return (
    <View
      accessibilityLabel={active ? "waveform-active" : "waveform-idle"}
      style={{
        height: 36,
        width: "100%",
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 2,
        backgroundColor: "transparent",
      }}
    >
      {BAR_HEIGHTS.map((h, i) => (
        <View
          // eslint-disable-next-line react/no-array-index-key -- static decorative bars
          key={i}
          style={{
            width: 3,
            height: Math.max(4, Math.round(h * 30)),
            borderRadius: 2,
            backgroundColor: active
              ? stageColors.waveformActive
              : stageColors.waveformIdle,
            opacity: active ? 0.45 + h * 0.55 : 0.55,
          }}
        />
      ))}
    </View>
  );
}
