import { View } from "react-native";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/** Home loading — exactly 2 skeleton cards h=120 matching PersonaCard layout. */
export function PersonaCardSkeleton() {
  return (
    <View
      accessibilityLabel="loading"
      style={{
        minHeight: 120,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "#243047",
        backgroundColor: "#1B2538",
        padding: 20,
        marginBottom: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        opacity: 0.7,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: "#243047",
        }}
      />
      <View style={{ flex: 1, gap: 8 }}>
        <View
          style={{
            height: 16,
            width: "55%",
            borderRadius: 8,
            backgroundColor: "#243047",
          }}
        />
        <View
          style={{
            height: 14,
            width: "90%",
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
    </View>
  );
}
