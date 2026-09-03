import { View } from "react-native";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/** Home loading — exactly 2 skeleton heroes h=220 matching dual_portrait glass. */
export function PersonaCardSkeleton() {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  return (
    <View
      accessibilityLabel="loading"
      style={{
        minHeight: 220,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        backgroundColor: colors.glassFill,
        padding: 16,
        marginBottom: 16,
        opacity: 0.7,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: 140,
          borderRadius: 12,
          backgroundColor: colors.bgMuted,
          borderWidth: 1,
          borderColor: colors.glassBorder,
          marginBottom: 12,
        }}
      />
      <View style={{ gap: 8 }}>
        <View
          style={{
            height: 16,
            width: "55%",
            borderRadius: 8,
            backgroundColor: colors.border,
          }}
        />
        <View
          style={{
            height: 14,
            width: "90%",
            borderRadius: 8,
            backgroundColor: colors.border,
          }}
        />
        <View
          style={{
            height: 14,
            width: "70%",
            borderRadius: 8,
            backgroundColor: colors.border,
          }}
        />
      </View>
    </View>
  );
}
