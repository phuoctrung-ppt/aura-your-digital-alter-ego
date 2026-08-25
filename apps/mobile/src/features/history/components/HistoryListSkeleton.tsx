import { View } from "react-native";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: History loading — exactly 6 skeleton rows h=72

/** History loading — 6 skeleton rows matching HistorySessionRow height. */
export function HistoryListSkeleton() {
  return (
    <View accessibilityLabel="loading">
      {Array.from({ length: 6 }).map((_, index) => (
        <View
          key={`history-skel-${index}`}
          style={{
            minHeight: 72,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#243047",
            backgroundColor: "#1B2538",
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
              backgroundColor: "#243047",
            }}
          />
          <View
            style={{
              height: 14,
              width: "70%",
              borderRadius: 8,
              backgroundColor: "#243047",
            }}
          />
        </View>
      ))}
    </View>
  );
}
