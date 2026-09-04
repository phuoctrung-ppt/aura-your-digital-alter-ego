import { useCallback, useEffect, useState } from "react";
import { AccessibilityInfo, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Persona, PersonaLanguage, PersonaSlug } from "@aura/contracts";
import { personasApi } from "../../../lib/api";
import { isApiMockEnabled } from "../../../lib/config";
import { homeCopy } from "../../../lib/i18n";
import { useNetworkStatus } from "../../../lib/network/useNetworkStatus";
import { useSession } from "../../../lib/session";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";
import { ErrorBanner, NetworkEmpty } from "../../shared";
import { PersonaCard } from "../components/PersonaCard";
import { PersonaCardSkeleton } from "../components/PersonaCardSkeleton";
import { FALLBACK_PERSONAS, onlyMvpPersonas } from "../fallback-personas";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: language pick at home_pre_session only — mid-call forbidden

type HomeScreenProps = {
  /** Navigate after createSession succeeds (route owns create). */
  onStartSession?: (
    personaSlug: PersonaSlug,
    locale: PersonaLanguage,
  ) => void | Promise<void>;
  /** Parent may pass starting state while createSession is in flight. */
  starting?: boolean;
};

function defaultLocaleFor(persona: Persona): PersonaLanguage {
  if (persona.supportedLanguages.includes("vi")) return "vi";
  return persona.supportedLanguages[0] ?? "vi";
}

/**
 * Home — greeting + exactly 2 dual_portrait glass persona heroes.
 * Offline → NetworkEmpty. API fail → Design Contract VN fallback (still 2) + retry banner.
 */
export function HomeScreen({ onStartSession, starting }: HomeScreenProps) {
  const { user } = useSession();
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);
  const { isOnline, refresh: refreshNetwork } = useNetworkStatus();
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [localeBySlug, setLocaleBySlug] = useState<
    Partial<Record<PersonaSlug, PersonaLanguage>>
  >({});

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const applyPersonas = useCallback((items: Persona[]) => {
    setPersonas(items);
    setLocaleBySlug((prev) => {
      const next: Partial<Record<PersonaSlug, PersonaLanguage>> = { ...prev };
      for (const persona of items) {
        const current = next[persona.slug];
        if (!current || !persona.supportedLanguages.includes(current)) {
          next[persona.slug] = defaultLocaleFor(persona);
        }
      }
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (isApiMockEnabled()) {
      applyPersonas([...FALLBACK_PERSONAS]);
      setLoading(false);
      return;
    }

    try {
      const items = await personasApi.listPersonas();
      applyPersonas(onlyMvpPersonas(items));
    } catch {
      setError(homeCopy.error_load);
      applyPersonas([...FALLBACK_PERSONAS]);
    } finally {
      setLoading(false);
    }
  }, [applyPersonas]);

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

  const meshOpacity = reduceMotion ? 0.04 : 0.1;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bgApp }}
      edges={["top"]}
    >
      <View style={{ flex: 1 }}>
        {/* Soft ambient mesh — pointerEvents none; opacity-only under reduceMotion */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -40,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: 9999,
            backgroundColor: colors.personaTintInterviewer,
            opacity: meshOpacity,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 180,
            left: -80,
            width: 260,
            height: 260,
            borderRadius: 9999,
            backgroundColor: colors.personaTintBuddy,
            opacity: meshOpacity * 0.85,
          }}
        />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              alignSelf: "flex-start",
              marginBottom: 8,
              borderRadius: 9999,
              borderWidth: 1,
              borderColor: colors.accentGlow,
              backgroundColor: colors.accentMuted,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text
              style={{
                color: colors.accentInk,
                fontSize: 11,
                fontWeight: "600",
                letterSpacing: 1.2,
                lineHeight: 16,
              }}
            >
              AURA AI
            </Text>
          </View>

          <Text
            style={{
              marginBottom: 4,
              color: colors.textSecondary,
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
              color: colors.text,
              fontSize: 24,
              fontWeight: "600",
              lineHeight: 30,
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

          {personas?.map((persona) => {
            const locale =
              localeBySlug[persona.slug] ?? defaultLocaleFor(persona);
            return (
              <PersonaCard
                key={persona.slug}
                persona={persona}
                disabled={starting}
                busy={starting}
                locale={locale}
                onLocaleChange={(slug, next) => {
                  setLocaleBySlug((prev) => ({ ...prev, [slug]: next }));
                }}
                onPress={(slug, selectedLocale) => {
                  void onStartSession?.(slug, selectedLocale);
                }}
              />
            );
          })}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
