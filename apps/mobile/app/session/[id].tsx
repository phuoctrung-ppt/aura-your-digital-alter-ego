import { useLocalSearchParams, useRouter } from "expo-router";
import type { PersonaSlug, SessionReplyLocale } from "@aura/contracts";
import { SessionScreen } from "../../src/features/session";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

function asPersonaSlug(
  value: string | string[] | undefined,
): PersonaSlug | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "tough-interviewer" || raw === "native-buddy") {
    return raw;
  }
  return undefined;
}

function asLocale(
  value: string | string[] | undefined,
): SessionReplyLocale {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "en" || raw === "vi") {
    return raw;
  }
  return "vi";
}

/**
 * Session presence route (mobile_stack, no tabs).
 * Params: id (session uuid), optional personaSlug, locale (read-only chip).
 */
export default function SessionRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    personaSlug?: string | string[];
    locale?: string | string[];
  }>();

  const sessionId =
    typeof params.id === "string" && params.id.length > 0
      ? params.id
      : undefined;

  return (
    <SessionScreen
      sessionId={sessionId}
      personaSlug={asPersonaSlug(params.personaSlug)}
      locale={asLocale(params.locale)}
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
      }}
    />
  );
}
