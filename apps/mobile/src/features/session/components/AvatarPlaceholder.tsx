import type { AvatarCue } from "@aura/contracts";
import { AvatarDegraded, mapSessionToAvatarFsm } from "../../avatar";
import type { SessionUiState } from "../types";

/**
 * @deprecated Superseded by `features/avatar` (`AvatarStage`).
 * Thin adapter kept so stale imports compile during M8 cutover.
 * Prefer `AvatarStage` from `../../avatar` — delete when unused.
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
