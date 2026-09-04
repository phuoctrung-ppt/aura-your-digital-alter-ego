import { Canvas } from "@react-three/fiber/native";
import { View } from "react-native";
import { stageColors } from "../../lib/theme";
import { resolveAvatarAsset } from "./avatarAssets";
import { AvatarDegraded } from "./AvatarDegraded";
import { AvatarScene } from "./AvatarScene";
import { FpsOverlay } from "./fpsOverlay";
import type { AvatarStageProps } from "./types";
import { useAvatarFsm } from "./useAvatarFsm";
import { useAvatarPlaybackBridge } from "./useAvatarPlaybackBridge";
import { useLipSync } from "./useLipSync";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// Tokens: force_dark stage via stageColors; WRAP ONLY — no FSM / lip-sync / R3F rewrite.

function envFlagTrue(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/**
 * @deprecated Legacy R3F / Expo GL session stage (M8).
 * **Demoted by ADR-0006 / M15 calling UI** — Session primary is `CircleAvatar`.
 * Do **not** mount on the default Session path. Keep for opt-in experiments:
 * set `EXPO_PUBLIC_AVATAR_R3F=1` in a custom host only.
 *
 * Import `@react-three/fiber/native` only. Remote JS debugging breaks GLView.
 */
export function AvatarStage({
  state,
  avatarCue,
  personaName,
  avatarAssetKey,
  jawOpen: jawOpenProp,
  degraded: degradedProp,
}: AvatarStageProps) {
  const fsm = useAvatarFsm({ state, avatarCue });
  const asset = resolveAvatarAsset(avatarAssetKey);
  const r3fEnabled = envFlagTrue(process.env.EXPO_PUBLIC_AVATAR_R3F);
  const forceDegraded =
    !r3fEnabled ||
    degradedProp === true ||
    envFlagTrue(process.env.EXPO_PUBLIC_AVATAR_DEGRADED);
  const { player, isPlaying } = useAvatarPlaybackBridge({ enabled: true });
  const { jawOpen: lipJaw } = useLipSync({
    player,
    active: fsm === "talk" || isPlaying,
  });
  const jawOpen = jawOpenProp ?? lipJaw;

  if (forceDegraded) {
    return (
      <AvatarDegraded fsm={fsm} personaName={personaName} jawOpen={jawOpen} />
    );
  }

  return (
    <View
      style={{
        width: "100%",
        flex: 1,
        borderRadius: 20,
        backgroundColor: stageColors.bg,
        borderWidth: 1,
        borderColor: stageColors.borderStrong,
        overflow: "hidden",
      }}
      accessibilityLabel={`avatar stage ${fsm}${
        asset.proceduralPlaceholder ? " placeholder" : ""
      }`}
    >
      <Canvas
        style={{ flex: 1 }}
        // Native Canvas — keep GL lightweight (no shadows / postprocessing).
        camera={{ position: [0, 0.1, 2.35], fov: 42, near: 0.1, far: 20 }}
        gl={{ antialias: true }}
      >
        <AvatarScene
          fsm={fsm}
          avatarAssetKey={asset.key}
          jawOpen={jawOpen}
        />
      </Canvas>
      <FpsOverlay />
    </View>
  );
}
