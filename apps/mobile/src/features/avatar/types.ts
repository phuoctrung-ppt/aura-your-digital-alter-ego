import type { AudioPlayer } from "expo-audio";
import type { AvatarCue } from "@aura/contracts";
import type { SessionUiState } from "../session/types";

/**
 * Client avatar FSM (SP-1 / Design Contract).
 * Distinct from SessionUiState: recording/processing map into listen|idle.
 */
export type AvatarFsmState = "idle" | "listen" | "talk";

export type AvatarStageProps = {
  state: SessionUiState;
  /** Prefer TurnResponse / WS avatarCue when present. */
  avatarCue?: AvatarCue;
  personaName?: string;
  /** Catalog key — both MVP personas share one mesh (see avatarAssets). */
  avatarAssetKey?: string;
  /** 0–1 jaw open from lip-sync; ignored on degraded path until pulse lands. */
  jawOpen?: number;
  /** Force static portrait path (FPS No-Go / thermal). */
  degraded?: boolean;
};

export type AvatarSceneProps = {
  fsm: AvatarFsmState;
  avatarAssetKey?: string;
  jawOpen: number;
};

export type AvatarModelProps = {
  fsm: AvatarFsmState;
  avatarAssetKey?: string;
  jawOpen: number;
};

export type AvatarDegradedProps = {
  fsm: AvatarFsmState;
  personaName?: string;
  jawOpen?: number;
};

export type UseAvatarFsmInput = {
  state: SessionUiState;
  avatarCue?: AvatarCue;
};

export type UseLipSyncResult = {
  jawOpen: number;
};

export type UseAvatarPlaybackBridgeResult = {
  /** Active expo-audio player while TTS plays. */
  player: AudioPlayer | null;
  isPlaying: boolean;
};
