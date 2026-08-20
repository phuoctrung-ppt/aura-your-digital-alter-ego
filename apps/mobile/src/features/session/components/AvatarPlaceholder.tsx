import { Text, View } from "react-native";
import type { AvatarCue } from "@aura/contracts";
import type { SessionUiState } from "../types";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type AvatarPlaceholderProps = {
  state: SessionUiState;
  personaName?: string;
  /** From TurnResponse.avatarCue when available (M8 will drive R3F). */
  avatarCue?: AvatarCue;
};

function cueFromState(state: SessionUiState): AvatarCue {
  if (state === "talk") return "talk";
  if (state === "listen" || state === "recording" || state === "processing") {
    return "listen";
  }
  return "idle";
}

/**
 * Placeholder for M8 R3F avatar surface (~58% height).
 * Do NOT add expo-gl / R3F here — M8 owns that.
 */
export function AvatarPlaceholder({
  state,
  personaName,
  avatarCue,
}: AvatarPlaceholderProps) {
  const cue = avatarCue ?? cueFromState(state);

  return (
    <View
      style={{
        width: "100%",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 16,
        backgroundColor: "#141C2E",
        borderWidth: 1,
        borderColor: "#243047",
      }}
    >
      <View
        style={{
          width: 96,
          height: 96,
          borderRadius: 9999,
          backgroundColor: "#1B2538",
          borderWidth: 2,
          borderColor: cue === "talk" ? "#2DD4BF" : "#33415C",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
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
        avatar · {cue}
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: "#6B7A94",
          fontSize: 12,
          fontWeight: "400",
          lineHeight: 16,
          textAlign: "center",
          paddingHorizontal: 24,
        }}
      >
        M8 sẽ thay bằng 3D avatar
      </Text>
    </View>
  );
}
