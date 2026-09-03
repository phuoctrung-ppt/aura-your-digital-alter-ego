import { Text, View } from "react-native";
import type { AvatarDegradedProps } from "./types";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// WRAP ONLY — force_dark stage chrome; FSM labels unchanged.

/**
 * Static portrait + opacity/scale pulse for FPS / thermal degraded path (SP-1).
 * Keeps FSM labels accurate; talk accent uses Design Contract cyan (`#00e5ff`) only.
 */
export function AvatarDegraded({
  fsm,
  personaName,
  jawOpen = 0,
}: AvatarDegradedProps) {
  const talkAccent = fsm === "talk";
  const clampedJaw = Math.max(0, Math.min(1, jawOpen));
  const scale = talkAccent ? 1 + clampedJaw * 0.06 : 1;
  const opacity = talkAccent ? 0.82 + clampedJaw * 0.18 : 1;

  return (
    <View
      style={{
        width: "100%",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 20,
        backgroundColor: "#040d1a",
        borderWidth: 1,
        borderColor: "#243047",
      }}
      accessibilityLabel={`avatar degraded ${fsm}`}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 9999,
          backgroundColor: "#101826",
          borderWidth: 2,
          borderColor: talkAccent ? "#00e5ff" : "#33415C",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          opacity,
          transform: [{ scale }],
        }}
      >
        <Text
          style={{
            color: "#F5F7FA",
            fontSize: 22,
            fontWeight: "600",
            lineHeight: 28,
          }}
        >
          {(personaName ?? "A").slice(0, 1)}
        </Text>
      </View>
      <Text
        style={{
          color: "#F5F7FA",
          fontSize: 16,
          fontWeight: "600",
          lineHeight: 22,
          marginBottom: 4,
        }}
      >
        {personaName ?? "Aura"}
      </Text>
      <Text
        style={{
          color: "#6B7A94",
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        avatar · {fsm} · degraded
      </Text>
    </View>
  );
}
