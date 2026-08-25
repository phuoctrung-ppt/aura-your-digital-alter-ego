import { Canvas } from "@react-three/fiber/native";
import { View } from "react-native";
import { resolveAvatarAsset } from "./avatarAssets";
import { AvatarDegraded } from "./AvatarDegraded";
import { AvatarScene } from "./AvatarScene";
import { FpsOverlay } from "./fpsOverlay";
import type { AvatarStageProps } from "./types";
import { useAvatarFsm } from "./useAvatarFsm";
import { useAvatarPlaybackBridge } from "./useAvatarPlaybackBridge";
import { useLipSync } from "./useLipSync";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// Tokens: canvas #0B1220, stage #141C2E, talk accent #2DD4BF only

function envFlagTrue(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

/**
 * Session avatar stage host (~58% height owned by SessionScreen parent).
 * Mounts R3F Canvas only while Session is mounted; tears down on leave.
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
  const forceDegraded =
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
        borderRadius: 16,
        backgroundColor: "#141C2E",
        borderWidth: 1,
        borderColor: "#243047",
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
