import type { AvatarCue } from "@aura/contracts";
import { AvatarDegraded, mapSessionToAvatarFsm } from "../../avatar";
import type { SessionUiState } from "../types";

/**
 * @deprecated Prefer `CircleAvatar` from `../../avatar` (ADR-0006 calling UI).
 * Thin adapter kept so stale imports compile; demoted R3F `AvatarStage` is legacy-only.
 */
type AvatarPlaceholderProps = {
  state: SessionUiState;
  personaName?: string;
  avatarCue?: AvatarCue;
};

export function AvatarPlaceholder({
  state,
  personaName,
  avatarCue,
}: AvatarPlaceholderProps) {
  const fsm = mapSessionToAvatarFsm(state, avatarCue);
  return <AvatarDegraded fsm={fsm} personaName={personaName} />;
}
