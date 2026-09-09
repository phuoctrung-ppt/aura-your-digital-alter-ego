/**
 * ThemeProvider — resolve system/light/dark; drive NativeWind class mode.
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 *
 * Gotcha: NativeWind `setColorScheme` requires tailwind `darkMode: "class"`.
 * Session stage always uses force_dark tokens (see STAGE_* helpers) even when
 * chrome is light.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, View, type ColorSchemeName } from "react-native";
import { useColorScheme } from "nativewind";
import { StatusBar } from "expo-status-bar";
import {
  appearanceStore,
  resolveAppearance,
  type AppearancePreference,
  type AppearanceStore,
  type ResolvedColorScheme,
} from "./appearance-store";

/** Session / avatar stage — always dark presence tokens (UI v3 navy). */
export const STAGE_BG = "#040d1a";
export const STAGE_ELEVATED = "#0a1628";
export const STAGE_TEXT = "#E8F4F8";

/** Splash / hydrating canvas — dark navy per Design Contract. */
export const SPLASH_BG = "#040d1a";

/** Theme cross-fade ms (instant under reduced-motion — frontend-worker). */
export const THEME_CROSS_FADE_MS = 200;

type ThemeContextValue = {
  appearance: AppearancePreference;
  resolved: ResolvedColorScheme;
  setAppearance: (value: AppearancePreference) => Promise<void>;
  isHydrating: boolean;
  /** Session stage always force_dark regardless of chrome theme. */
  forceDarkStage: true;
  stageBg: typeof STAGE_BG;
  stageElevated: typeof STAGE_ELEVATED;
  stageText: typeof STAGE_TEXT;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemSchemeFromOs(
  scheme: ColorSchemeName | null | undefined,
): ResolvedColorScheme {
  return scheme === "light" ? "light" : "dark";
}

type ThemeProviderProps = {
  children: ReactNode;
  /** Inject store for tests; defaults to file/localStorage singleton. */
  store?: AppearanceStore;
};

export function ThemeProvider({
  children,
  store = appearanceStore,
}: ThemeProviderProps) {
  const { setColorScheme } = useColorScheme();
  const [appearance, setAppearanceState] =
    useState<AppearancePreference>("system");
  const [systemScheme, setSystemScheme] = useState<ResolvedColorScheme>(() =>
    systemSchemeFromOs(Appearance.getColorScheme()),
  );
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await store.get();
        if (!cancelled) setAppearanceState(stored);
      } finally {
        if (!cancelled) setIsHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(systemSchemeFromOs(colorScheme));
    });
    return () => sub.remove();
  }, []);

  const resolved = useMemo(
    () => resolveAppearance(appearance, systemScheme),
    [appearance, systemScheme],
  );

  useEffect(() => {
    // Requires tailwind `darkMode: "class"` — media mode throws from css-interop.
    setColorScheme(resolved);
  }, [resolved, setColorScheme]);

  const setAppearance = useCallback(
    async (value: AppearancePreference) => {
      setAppearanceState(value);
      await store.set(value);
    },
    [store],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance,
      resolved,
      setAppearance,
      isHydrating,
      forceDarkStage: true,
      stageBg: STAGE_BG,
      stageElevated: STAGE_ELEVATED,
      stageText: STAGE_TEXT,
    }),
    [appearance, resolved, setAppearance, isHydrating],
  );

  const rootClass = resolved === "dark" ? "dark" : "light";
  const canvasBg = resolved === "dark" ? SPLASH_BG : "#F4F7FB";

  return (
    <ThemeContext.Provider value={value}>
      <View style={{ flex: 1, backgroundColor: canvasBg }} className={rootClass}>
        {children}
        {/* Utility screens follow resolved theme; Session overrides to light content. */}
        <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

/**
 * Session force_dark helpers — stage tokens are theme-stable.
 * Frontend-worker should apply these on the session canvas regardless of chrome.
 */
export const forceDarkStage = {
  bg: STAGE_BG,
  elevated: STAGE_ELEVATED,
  text: STAGE_TEXT,
  statusBarStyle: "light" as const,
} as const;
