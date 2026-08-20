import { View } from "react-native";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type WaveformProps = {
  state: SessionUiState;
};

const BAR_HEIGHTS = [0.35, 0.6, 0.9, 0.45, 0.75, 0.55, 0.85, 0.4, 0.7, 0.5];

/**
 * Decorative waveform — height 36, bar 3 / gap 2.
 * Active during talk/recording (accent); idle uses waveform-idle.
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
        backgroundColor: "#1B2538",
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
      }}
    >
      {BAR_HEIGHTS.map((h, i) => (
        <View
          // eslint-disable-next-line react/no-array-index-key -- static decorative bars
          key={i}
          style={{
            width: 3,
            height: Math.max(4, Math.round(h * 28)),
            borderRadius: 2,
            backgroundColor: active ? "#2DD4BF" : "#33415C",
          }}
        />
      ))}
    </View>
  );
}
