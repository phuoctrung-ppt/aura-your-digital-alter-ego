/**
 * Hook: resolved light|dark + appearance preference.
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 */

import { useTheme } from "./ThemeProvider";
import type { AppearancePreference, ResolvedColorScheme } from "./appearance-store";

export type ResolvedTheme = {
  /** User preference: system | light | dark */
  appearance: AppearancePreference;
  /** Effective scheme after OS + override */
  resolved: ResolvedColorScheme;
  /** Persist preference (async; updates context when done) */
  setAppearance: (value: AppearancePreference) => Promise<void>;
  /** True while prefs hydrate from disk */
  isHydrating: boolean;
};

/**
 * Convenience wrapper around ThemeProvider context.
 * Must be used under `<ThemeProvider>`.
 */
export function useResolvedTheme(): ResolvedTheme {
  const { appearance, resolved, setAppearance, isHydrating } = useTheme();
  return { appearance, resolved, setAppearance, isHydrating };
}
