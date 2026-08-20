import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Persona, PersonaSlug } from "@aura/contracts";
import { personasApi } from "../../../lib/api";
import { isApiMockEnabled } from "../../../lib/config";
import { homeCopy } from "../../../lib/i18n";
import { useNetworkStatus } from "../../../lib/network/useNetworkStatus";
import { useSession } from "../../../lib/session";
import { ErrorBanner, NetworkEmpty } from "../../shared";
import { PersonaCard } from "../components/PersonaCard";
import { PersonaCardSkeleton } from "../components/PersonaCardSkeleton";
import { FALLBACK_PERSONAS, onlyMvpPersonas } from "../fallback-personas";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type HomeScreenProps = {
  /** Navigate after createSession succeeds (route owns create). */
  onStartSession?: (personaSlug: PersonaSlug) => void | Promise<void>;
  /** Parent may pass starting state while createSession is in flight. */
  starting?: boolean;
};

/**
 * Home — greeting + exactly 2 persona cards.
 * Offline → NetworkEmpty. API fail → Design Contract VN fallback (still 2) + retry banner.
 */
export function HomeScreen({ onStartSession, starting }: HomeScreenProps) {
  const { user } = useSession();
  const { isOnline, refresh: refreshNetwork } = useNetworkStatus();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isApiMockEnabled()) {
      setPersonas([...FALLBACK_PERSONAS]);
      setLoading(false);
      return;
    }

    try {
      const items = await personasApi.listPersonas();
      setPersonas(onlyMvpPersonas(items));
    } catch {
      setError(homeCopy.error_load);
      setPersonas([...FALLBACK_PERSONAS]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isOnline === false) {
    return (
      <NetworkEmpty
        onRetry={() => {
          void refreshNetwork();
          void load();
        }}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            marginBottom: 4,
            color: "#6B7A94",
            fontSize: 13,
            fontWeight: "500",
            lineHeight: 18,
          }}
        >
          {homeCopy.greeting}
          {user?.email ? ` · ${user.email}` : ""}
        </Text>
        <Text
          style={{
            marginBottom: 24,
            color: "#F5F7FA",
            fontSize: 22,
            fontWeight: "600",
            lineHeight: 28,
          }}
        >
          {homeCopy.title}
        </Text>

        {error ? (
          <ErrorBanner
            message={error}
            onRetry={() => {
              void load();
            }}
          />
        ) : null}

        {loading && !personas ? (
          <View>
            <PersonaCardSkeleton />
            <PersonaCardSkeleton />
          </View>
        ) : null}

        {personas?.map((persona) => (
          <PersonaCard
            key={persona.slug}
            persona={persona}
            disabled={starting}
            busy={starting}
            onPress={(slug) => {
              void onStartSession?.(slug);
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
