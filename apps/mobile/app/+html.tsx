import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Web-only document shell (expo-router ignores this on native).
 * `class="dark"` matches tailwind `darkMode: "class"` + Aura dark-first tokens.
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
