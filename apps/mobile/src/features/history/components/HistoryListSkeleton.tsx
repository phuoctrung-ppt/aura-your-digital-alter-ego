import { View } from "react-native";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: History loading — exactly 6 skeleton rows h=88 · radius 16

/** History loading — 6 skeleton rows matching HistorySessionRow height. */
export function HistoryListSkeleton() {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  return (
    <View accessibilityLabel="loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <View
          key={`history-skel-${index}`}
          style={{
            minHeight: 88,
            height: 88,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.glassBorder,
            backgroundColor: colors.bgMuted,
            paddingHorizontal: 16,
            paddingVertical: 12,
            marginBottom: 12,
            justifyContent: "center",
            opacity: 0.7,
            gap: 8,
          }}
        >
          <View
            style={{
              height: 16,
              width: "45%",
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
      ))}
    </View>
  );
}
