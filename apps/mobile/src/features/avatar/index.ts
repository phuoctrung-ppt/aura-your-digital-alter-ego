export type {
  AvatarDegradedProps,
  AvatarFsmState,
  AvatarModelProps,
  AvatarSceneProps,
  AvatarStageProps,
  UseAvatarFsmInput,
  UseAvatarPlaybackBridgeResult,
  UseLipSyncResult,
} from "./types";
export {
  resolveAvatarAsset,
  resolveCircleAvatarAsset,
  SHARED_PERSONA_GLB_PATH,
  SHARED_PERSONA_LOD_GLB_PATH,
  type AvatarAssetRef,
  type CircleAvatarAssetRef,
} from "./avatarAssets";
/** Primary Session presence (ADR-0006 calling UI). */
export { CircleAvatar, type CircleAvatarProps } from "./CircleAvatar";
/**
 * @deprecated Legacy R3F stage — demoted; do not mount on default Session path.
 * Opt-in only via explicit import + EXPO_PUBLIC_AVATAR_R3F=1.
 */
export { AvatarStage } from "./AvatarStage";
export { AvatarScene } from "./AvatarScene";
export { AvatarModel } from "./AvatarModel";
export { AvatarDegraded } from "./AvatarDegraded";
export { mapSessionToAvatarFsm, useAvatarFsm } from "./useAvatarFsm";
export { useLipSync } from "./useLipSync";
export { useAvatarPlaybackBridge } from "./useAvatarPlaybackBridge";
export { FpsOverlay } from "./fpsOverlay";
