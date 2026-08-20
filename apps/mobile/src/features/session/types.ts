/**
 * Session presence UI state machine (Design Contract session_* states).
 * AvatarCue from contracts is idle|listen|talk; recording/processing are client-only.
 */
export type SessionUiState =
  | "idle"
  | "listen"
  | "talk"
  | "recording"
  | "processing";

export const SESSION_UI_STATES: readonly SessionUiState[] = [
  "idle",
  "listen",
  "talk",
  "recording",
  "processing",
] as const;
