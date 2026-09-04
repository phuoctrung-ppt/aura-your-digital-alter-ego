import { useMemo } from "react";
import { Image, Text, useWindowDimensions, View } from "react-native";
import type { AvatarCue } from "@aura/contracts";
import { sessionCopy } from "../../lib/i18n";
import { stageColors } from "../../lib/theme";
import { resolveCircleAvatarAsset } from "./avatarAssets";
import { mapSessionToAvatarFsm } from "./useAvatarFsm";
import type { SessionUiState } from "../session/types";
import type { AvatarFsmState } from "./types";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: circle_2d 168 (clamp 148–184) · max width 48% · FSM idle|listen|talk

export type CircleAvatarProps = {
  state: SessionUiState;
  avatarCue?: AvatarCue;
  personaName?: string;
  /** Catalog key — PNG under assets/avatar or initials fallback. */
  avatarAssetKey?: string;
  /** Non-CTA persona tint hairline (buddy violet / interviewer cyan). */
  tintColor?: string;
};

const DIAMETER_REF = 168;
const DIAMETER_MIN = 148;
const DIAMETER_MAX = 184;
const MAX_WIDTH_PCT = 0.48;

function initialsFrom(name?: string, key?: string): string {
  const source = (name ?? key ?? "A").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  if (key === "tough-interviewer") return "TI";
  if (key === "native-buddy") return "NB";
  return source.slice(0, 2).toUpperCase() || "A";
}

function ringFor(fsm: AvatarFsmState): { color: string; width: number } {
  switch (fsm) {
    case "talk":
      return { color: stageColors.accent, width: 3 };
    case "listen":
      return { color: stageColors.info, width: 2 };
    case "idle":
    default:
      return { color: stageColors.pttRingIdle, width: 2 };
  }
}

/**
 * Primary Session presence — 2D calling-UI circle (ADR-0006).
 * R3F Canvas is forbidden on the default Session path.
 */
export function CircleAvatar({
  state,
  avatarCue,
  personaName,
  avatarAssetKey,
  tintColor,
}: CircleAvatarProps) {
  const { width: windowWidth } = useWindowDimensions();
  const fsm = mapSessionToAvatarFsm(state, avatarCue);
  const asset = resolveCircleAvatarAsset(avatarAssetKey);
  const ring = ringFor(fsm);

  const diameter = useMemo(() => {
    const contentWidth = Math.min(windowWidth, 390) - 40;
    const byPct = Math.round(contentWidth * MAX_WIDTH_PCT);
    return Math.max(DIAMETER_MIN, Math.min(DIAMETER_MAX, Math.min(DIAMETER_REF, byPct)));
  }, [windowWidth]);

  const a11yName = personaName ?? "Aura";
  const label = sessionCopy.circle_avatar_a11y.replace("{personaName}", a11yName);
  const initials = initialsFrom(personaName, avatarAssetKey);

  return (
    <View
      style={{
        flex: 1,
        width: "100%",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        testID="session-circle-avatar"
        accessibilityLabel={`${label} · ${fsm}`}
        style={{
          width: diameter,
          height: diameter,
          borderRadius: 9999,
          borderWidth: ring.width,
          borderColor: ring.color,
          backgroundColor: stageColors.elevated,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          // Non-CTA persona tint hairline under the FSM ring
          shadowColor: tintColor ?? "transparent",
          shadowOpacity: tintColor ? 0.35 : 0,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        {asset.source ? (
          <Image
            source={asset.source}
            style={{ width: diameter, height: diameter }}
            resizeMode="cover"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : (
          <Text
            style={{
              color: stageColors.text,
              fontSize: 40,
              fontWeight: "700",
              lineHeight: 48,
            }}
          >
            {initials}
          </Text>
        )}
      </View>
    </View>
  );
}
