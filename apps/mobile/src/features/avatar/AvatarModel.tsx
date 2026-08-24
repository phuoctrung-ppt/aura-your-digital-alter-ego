import { useFrame } from "@react-three/fiber/native";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import { resolveAvatarAsset } from "./avatarAssets";
import type { AvatarModelProps } from "./types";

/**
 * Procedural bust (shared mesh for both personas) until persona.glb lands.
 * Structure keeps avatarAssetKey so a future useGLTF path can swap in without
 * changing AvatarStage / Session APIs.
 *
 * Import `@react-three/fiber/native` only — never web R3F entries.
 * Gotcha: remote JS debugging breaks GLView.
 *
 * Do NOT invent a second persona mesh.
 */
export function AvatarModel({
  fsm,
  avatarAssetKey,
  jawOpen,
}: AvatarModelProps) {
  const rootRef = useRef<Group>(null);
  const jawRef = useRef<Mesh>(null);
  const asset = useMemo(
    () => resolveAvatarAsset(avatarAssetKey),
    [avatarAssetKey],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const root = rootRef.current;
    if (root) {
      // Subtle idle breathe; listen lean; talk keeps torso calm.
      const breathe = 1 + Math.sin(t * 1.6) * 0.012;
      root.scale.setScalar(breathe);
      const listenLean = fsm === "listen" ? -0.08 : 0;
      const talkNod = fsm === "talk" ? Math.sin(t * 2.2) * 0.02 : 0;
      root.rotation.x = listenLean + talkNod;
      root.position.y = Math.sin(t * 1.6) * 0.015;
    }

    const jaw = jawRef.current;
    if (jaw) {
      const open = Math.max(0, Math.min(1, jawOpen));
      jaw.position.y = -0.42 - open * 0.14;
      jaw.scale.set(1, 0.55 + open * 0.7, 1);
    }
  });

  // Keep key in tree so future GLB branch can key off asset.proceduralPlaceholder.
  void asset.proceduralPlaceholder;

  return (
    <group ref={rootRef} position={[0, -0.15, 0]}>
      {/* Soft neck / shoulders */}
      <mesh position={[0, -0.85, 0]} castShadow={false} receiveShadow={false}>
        <cylinderGeometry args={[0.22, 0.38, 0.55, 16]} />
        <meshStandardMaterial color="#1B2538" roughness={0.85} metalness={0.05} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.05, 0]} castShadow={false} receiveShadow={false}>
        <sphereGeometry args={[0.55, 32, 32]} />
        <meshStandardMaterial color="#2A3650" roughness={0.7} metalness={0.08} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.18, 0.18, 0.46]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#F5F7FA" roughness={0.4} />
      </mesh>
      <mesh position={[0.18, 0.18, 0.46]}>
        <sphereGeometry args={[0.055, 12, 12]} />
        <meshStandardMaterial color="#F5F7FA" roughness={0.4} />
      </mesh>

      {/* Talk accent cue ring (Design Contract: #2DD4BF only) */}
      {fsm === "talk" ? (
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.62, 0.018, 8, 48]} />
          <meshStandardMaterial
            color="#2DD4BF"
            emissive="#2DD4BF"
            emissiveIntensity={0.35}
            roughness={0.5}
          />
        </mesh>
      ) : null}

      {/* Jaw — scaled by lip-sync jawOpen */}
      <mesh
        ref={jawRef}
        position={[0, -0.42, 0.18]}
        castShadow={false}
        receiveShadow={false}
      >
        <boxGeometry args={[0.38, 0.16, 0.28]} />
        <meshStandardMaterial color="#243047" roughness={0.75} metalness={0.05} />
      </mesh>
    </group>
  );
}
