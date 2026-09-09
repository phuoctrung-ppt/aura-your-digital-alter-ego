# Avatar assets (M8)

## Expected files

| File | Required | Notes |
|---|---|---|
| `persona.glb` | yes (when art lands) | **One shared mesh** for both MVP personas |
| `persona-lod-low.glb` | optional | LOD / mid-Android FPS path (SP-1) |

Catalog `avatarAssetKey` values `tough-interviewer` and `native-buddy` both map to this shared character — **do not** add a second persona mesh.

## License

Only commit GLBs with a clear redistributable license suitable for the Aura mobile app (commercial use). Keep license notes / attribution in this folder or `docs/` when the asset lands.

## Procedural placeholder

Until `persona.glb` is available, the Session stage uses a **procedural / chrome placeholder** (portrait circle + FSM cue). Do not block M8 implementation on art delivery.

## Do NOT commit

- Huge Blender `.blend` sources or raw scan dumps
- Unlicensed marketplace packs
- Per-persona duplicate meshes for MVP

## Runtime notes

- Load via Expo Asset / `expo-gl` + `@react-three/fiber/native` (frontend-worker).
- Remote JS debugging breaks `GLView` — leave it Off for FPS / GLB QA.
- Tear down the GL canvas when leaving Session.
