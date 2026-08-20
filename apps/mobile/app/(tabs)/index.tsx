import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import type { PersonaSlug } from "@aura/contracts";
import { HomeScreen } from "../../src/features/home";
import { sessionsApi } from "../../src/lib/api";
import { isApiMockEnabled } from "../../src/lib/config";
import { createClientTurnId } from "../../src/lib/id";
import { homeCopy } from "../../src/lib/i18n";
import { useNetworkStatus } from "../../src/lib/network/useNetworkStatus";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/**
 * Home tab — persona picker.
 * Creates a real session via POST /v1/sessions before navigating to presence.
 */
export default function HomeTab() {
  const router = useRouter();
  const { isOnline, refresh } = useNetworkStatus();
  const [starting, setStarting] = useState(false);

  const onStartSession = useCallback(
    async (personaSlug: PersonaSlug) => {
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
            params: { id: mockId, personaSlug },
          });
          return;
        }

        const res = await sessionsApi.createSession({
          personaSlug,
          locale: "vi",
        });
        router.push({
          pathname: "/session/[id]",
          params: { id: res.data.id, personaSlug },
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
