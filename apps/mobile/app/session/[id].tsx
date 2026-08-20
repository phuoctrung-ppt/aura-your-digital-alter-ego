import { useLocalSearchParams, useRouter } from "expo-router";
import type { PersonaSlug } from "@aura/contracts";
import { SessionScreen } from "../../src/features/session";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
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

/**
 * Session presence route (mobile_stack, no tabs).
 * Params: id (session uuid), optional personaSlug.
 */
export default function SessionRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    personaSlug?: string | string[];
  }>();

  const sessionId =
    typeof params.id === "string" && params.id.length > 0
      ? params.id
      : undefined;

  return (
    <SessionScreen
      sessionId={sessionId}
      personaSlug={asPersonaSlug(params.personaSlug)}
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
