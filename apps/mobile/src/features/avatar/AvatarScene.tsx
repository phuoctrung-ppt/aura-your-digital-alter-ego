import { AvatarModel } from "./AvatarModel";
import type { AvatarSceneProps } from "./types";

/**
 * R3F scene graph inside Canvas from `@react-three/fiber/native` + `expo-gl`.
 *
 * Soft ambient + one directional — no shadows, postprocessing, or HDR (SP-1).
 * Always import `/native` entries; remote JS debugging must be Off for QA.
 */
export function AvatarScene({
  fsm,
  avatarAssetKey,
  jawOpen,
}: AvatarSceneProps) {
  return (
    <>
      <color attach="background" args={["#141C2E"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.4, 3.2, 2.0]} intensity={0.85} />
      <AvatarModel
        fsm={fsm}
        avatarAssetKey={avatarAssetKey}
        jawOpen={jawOpen}
      />
    </>
  );
}
