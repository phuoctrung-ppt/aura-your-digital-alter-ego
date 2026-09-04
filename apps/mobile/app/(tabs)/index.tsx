import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import type { PersonaLanguage, PersonaSlug } from "@aura/contracts";
import { HomeScreen } from "../../src/features/home";
import { sessionsApi } from "../../src/lib/api";
import { isApiMockEnabled } from "../../src/lib/config";
import { createClientTurnId } from "../../src/lib/id";
import { homeCopy } from "../../src/lib/i18n";
import { useNetworkStatus } from "../../src/lib/network/useNetworkStatus";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: language pick at session start only (Home)

/**
 * Home tab — persona picker.
 * Creates a real session via POST /v1/sessions before navigating to presence.
 */
export default function HomeTab() {
  const router = useRouter();
  const { isOnline, refresh } = useNetworkStatus();
  const [starting, setStarting] = useState(false);

  const onStartSession = useCallback(
    async (personaSlug: PersonaSlug, locale: PersonaLanguage) => {
      if (starting) return;

      if (isOnline === false) {
        void refresh();
        return;
      }

      setStarting(true);
      try {
        if (isApiMockEnabled()) {
          const mockId = createClientTurnId();
          router.push({
            pathname: "/session/[id]",
            params: { id: mockId, personaSlug, locale },
          });
          return;
        }

        const res = await sessionsApi.createSession({
          personaSlug,
          locale,
        });
        router.push({
          pathname: "/session/[id]",
          params: {
            id: res.data.id,
            personaSlug,
            locale: res.data.locale ?? locale,
          },
        });
      } catch {
        Alert.alert(homeCopy.error_start_session, homeCopy.retry);
      } finally {
        setStarting(false);
      }
    },
    [isOnline, refresh, router, starting],
  );

  return <HomeScreen onStartSession={onStartSession} starting={starting} />;
}
