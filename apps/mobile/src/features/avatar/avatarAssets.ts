/**
 * avatarAssetKey → shared character asset map.
 *
 * MVP rule (SP-1 / M8): **one shared mesh** for both personas.
 * Catalog keys `tough-interviewer` and `native-buddy` resolve to the same
 * `persona.glb` (optional `persona-lod-low.glb` for degraded FPS).
 *
 * Until a licensed GLB lands under `apps/mobile/assets/avatar/`, the stage
 * uses a procedural placeholder (no require() of missing binary).
 *
 * Expected paths (frontend-worker after art lands):
 *   apps/mobile/assets/avatar/persona.glb
 *   apps/mobile/assets/avatar/persona-lod-low.glb  (optional)
 *
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

const SHARED_REF: Omit<AvatarAssetRef, "key"> = {
  glbPath: SHARED_PERSONA_GLB_PATH,
  lodGlbPath: SHARED_PERSONA_LOD_GLB_PATH,
  proceduralPlaceholder: true,
};

/** Both MVP keys map to the same shared character. */
const AVATAR_ASSET_MAP: Record<string, AvatarAssetRef> = {
  "tough-interviewer": { key: "tough-interviewer", ...SHARED_REF },
  "native-buddy": { key: "native-buddy", ...SHARED_REF },
};

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
