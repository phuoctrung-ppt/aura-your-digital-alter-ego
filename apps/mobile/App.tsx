/**
 * @deprecated M7 — entry is `expo-router/entry` (`package.json` main).
 * Root layout: `app/_layout.tsx` (SessionProvider + auth gate + tabs/session stacks).
 * Kept so accidental imports fail loudly instead of mounting the M2 gate.
 */
export { default } from "./app/_layout";
