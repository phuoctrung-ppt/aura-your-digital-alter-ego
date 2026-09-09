/**
 * Theme / appearance barrel (M14 UI v3 navy + cyan).
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 */

export {
  appearanceStore,
  appearanceStoreKeys,
  FileAppearanceStore,
  MemoryAppearanceStore,
  resolveAppearance,
  type AppearancePreference,
  type AppearanceStore,
  type ResolvedColorScheme,
} from "./appearance-store";

export {
  ThemeProvider,
  useTheme,
  forceDarkStage,
  STAGE_BG,
  STAGE_ELEVATED,
  STAGE_TEXT,
  SPLASH_BG,
  THEME_CROSS_FADE_MS,
} from "./ThemeProvider";

export { useResolvedTheme, type ResolvedTheme } from "./useResolvedTheme";

export {
  chromeColors,
  stageColors,
  personaTint,
  type ChromeColors,
  type StageColors,
} from "./theme-colors";
