import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Web-only document shell (expo-router ignores this on native).
 * Bootstrap `class="dark"` for first paint; ThemeProvider overrides via
 * NativeWind setColorScheme (requires tailwind `darkMode: "class"`).
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="vi" className="dark">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
      </head>
      <body className="dark">{children}</body>
    </html>
  );
}
