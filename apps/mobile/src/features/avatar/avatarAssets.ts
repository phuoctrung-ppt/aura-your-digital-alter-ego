import type { ImageSourcePropType } from "react-native";

/**
 * avatarAssetKey → asset map.
 *
 * **Primary (ADR-0006 / M15):** 2D calling-UI circle via PNG or initials.
 * Expected paths (when art lands):
 *   apps/mobile/assets/avatar/tough-interviewer.png
 *   apps/mobile/assets/avatar/native-buddy.png
 *
 * **Legacy (demoted):** shared GLB mesh for optional R3F AvatarStage only.
 * Do NOT invent a second persona mesh. Do NOT commit huge .blend sources.
 */

export const SHARED_PERSONA_GLB_PATH = "assets/avatar/persona.glb" as const;
export const SHARED_PERSONA_LOD_GLB_PATH =
  "assets/avatar/persona-lod-low.glb" as const;

export type AvatarAssetRef = {
  /** Logical key from Persona.avatarAssetKey */
  key: string;
  /** Relative path hint — not a Metro require until GLB exists */
  glbPath: typeof SHARED_PERSONA_GLB_PATH;
  lodGlbPath: typeof SHARED_PERSONA_LOD_GLB_PATH;
  /** True until persona.glb is committed / bundled */
  proceduralPlaceholder: boolean;
};

/** Primary 2D circle asset — PNG source or initials fallback. */
export type CircleAvatarAssetRef = {
  key: string;
  /** Metro Image source when PNG is bundled; null → initials. */
  source: ImageSourcePropType | null;
};

const SHARED_REF: Omit<AvatarAssetRef, "key"> = {
  glbPath: SHARED_PERSONA_GLB_PATH,
  lodGlbPath: SHARED_PERSONA_LOD_GLB_PATH,
  proceduralPlaceholder: true,
};

/** Both MVP keys map to the same shared character (legacy R3F only). */
const AVATAR_ASSET_MAP: Record<string, AvatarAssetRef> = {
  "tough-interviewer": { key: "tough-interviewer", ...SHARED_REF },
  "native-buddy": { key: "native-buddy", ...SHARED_REF },
};

/**
 * PNG map for calling-UI circle. Empty until assets land under
 * `apps/mobile/assets/avatar/*.png` — CircleAvatar falls back to initials.
 * When adding art, wire `require("../../../assets/avatar/…")` here.
 */
const CIRCLE_PNG_MAP: Record<string, ImageSourcePropType> = {
  // "tough-interviewer": require("../../../assets/avatar/tough-interviewer.png"),
  // "native-buddy": require("../../../assets/avatar/native-buddy.png"),
};

/** Legacy GLB resolver — used only by demoted AvatarStage. */
export function resolveAvatarAsset(
  avatarAssetKey?: string,
): AvatarAssetRef {
  if (avatarAssetKey && AVATAR_ASSET_MAP[avatarAssetKey]) {
    return AVATAR_ASSET_MAP[avatarAssetKey];
  }
  return {
    key: avatarAssetKey ?? "shared-persona",
    ...SHARED_REF,
  };
}

/** Primary circle avatar resolver (ADR-0006). */
export function resolveCircleAvatarAsset(
  avatarAssetKey?: string,
): CircleAvatarAssetRef {
  const key = avatarAssetKey ?? "shared-persona";
  return {
    key,
    source: CIRCLE_PNG_MAP[key] ?? null,
  };
}
