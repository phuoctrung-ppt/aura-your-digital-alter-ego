import { useMemo } from "react";
import type { AvatarCue } from "@aura/contracts";
import type { SessionUiState } from "../session/types";
import type { AvatarFsmState, UseAvatarFsmInput } from "./types";

/**
 * Pure SessionUiState + AvatarCue → idle|listen|talk.
 *
 * Mapping (implement plan §4):
 * - talk / avatarCue talk → talk
 * - recording / listen → listen
 * - processing → idle (subtle; keep calm during upload)
 * - safety / default → idle
 */
export function mapSessionToAvatarFsm(
  state: SessionUiState,
  avatarCue?: AvatarCue,
): AvatarFsmState {
  if (avatarCue === "talk" || state === "talk") {
    return "talk";
  }
  if (state === "recording" || state === "listen" || avatarCue === "listen") {
    return "listen";
  }
  // processing → idle (subtle) per plan; explicit avatarCue idle wins too
  return "idle";
}

export function useAvatarFsm({
  state,
  avatarCue,
}: UseAvatarFsmInput): AvatarFsmState {
  return useMemo(
    () => mapSessionToAvatarFsm(state, avatarCue),
    [state, avatarCue],
  );
}
