import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Expo config — reads public env for later API wiring.
 * EXPO_PUBLIC_API_URL is documented in AGENTS.md §13.
 *
 * Static fields also live in app.json; this file merges runtime `extra`.
 *
 * userInterfaceStyle: "automatic" — UI v3 dual theme (system default + Settings).
 * Splash stays #040d1a. ThemeProvider drives NativeWind class light|dark.
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  return {
    ...base,
    name: "Aura",
    slug: "aura",
    version: "0.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    scheme: "aura",
    // Splash stays #040d1a (app.json); do not redeclare here — ExpoConfig typing omits splash.
    ios: {
      ...(base.ios ?? {}),
      supportsTablet: true,
      bundleIdentifier: "app.aura.mobile",
    },
    android: {
      ...(base.android ?? {}),
      package: "app.aura.mobile",
      adaptiveIcon: {
        backgroundColor: "#040d1a",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
    },
    web: {
      ...(base.web ?? {}),
      bundler: "metro",
      favicon: "./assets/favicon.png",
    },
    plugins: [
      ...(base.plugins ?? []),
      "expo-router",
      "expo-secure-store",
      "expo-audio",
      "expo-asset",
    ],
    experiments: {
      ...(typeof base.experiments === "object" && base.experiments
        ? base.experiments
        : {}),
      typedRoutes: true,
    },
    extra: {
      ...(typeof base.extra === "object" && base.extra ? base.extra : {}),
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000",
      router: {},
    },
  };
};
