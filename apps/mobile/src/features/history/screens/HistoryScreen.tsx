import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@aura/contracts";
import { sessionsApi } from "../../../lib/api";
import { isApiMockEnabled } from "../../../lib/config";
import { historyCopy } from "../../../lib/i18n";
import { useNetworkStatus } from "../../../lib/network/useNetworkStatus";
import { ErrorBanner, NetworkEmpty } from "../../shared";
import { HistoryListSkeleton } from "../components/HistoryListSkeleton";
import { HistorySessionRow } from "../components/HistorySessionRow";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type HistoryScreenProps = {
  /** empty_never CTA → home tab. */
  onGoHome?: () => void;
  /** Row press → resume session route. */
  onResumeSession?: (session: Session) => void;
};

/**
 * History — list / resume sessions.
 * States: loading skeleton (6×h72), empty_network, error + retry,
 * empty_never CTA, list rows.
 */
export function HistoryScreen({
  onGoHome,
  onResumeSession,
}: HistoryScreenProps) {
  const { isOnline, refresh: refreshNetwork } = useNetworkStatus();
  const [items, setItems] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true;
    if (soft) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    if (isApiMockEnabled()) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const res = await sessionsApi.listSessions({ limit: 20 });
      setItems(res.data.items);
    } catch {
      setError(historyCopy.error_load);
      if (!soft) {
        setItems(null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  const showSkeleton = loading && items === null && !error;
  const showEmptyNever =
    !loading && !error && Array.isArray(items) && items.length === 0;
  const showList = Array.isArray(items) && items.length > 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, flex: 1 }}>
        <Text
          style={{
            marginBottom: 24,
            color: "#F5F7FA",
            fontSize: 22,
            fontWeight: "600",
            lineHeight: 28,
          }}
        >
          {historyCopy.title}
        </Text>

        {error ? (
          <ErrorBanner
            message={error}
            onRetry={() => {
              void load();
            }}
          />
        ) : null}

        {showSkeleton ? <HistoryListSkeleton /> : null}

        {showEmptyNever ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
            }}
          >
            <Text
              style={{
                marginBottom: 8,
                textAlign: "center",
                color: "#F5F7FA",
                fontSize: 16,
                fontWeight: "600",
                lineHeight: 22,
              }}
            >
              {historyCopy.empty_title}
            </Text>
            <Text
              style={{
                marginBottom: 24,
                textAlign: "center",
                color: "#A8B3C7",
                fontSize: 16,
                fontWeight: "400",
                lineHeight: 24,
              }}
            >
              {historyCopy.empty_body}
            </Text>
            <Pressable
              onPress={onGoHome}
              accessibilityRole="button"
              accessibilityLabel={historyCopy.empty_cta}
              style={{
                height: 52,
                minWidth: 160,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 12,
                backgroundColor: "#2DD4BF",
                paddingHorizontal: 16,
              }}
            >
              <Text
                style={{
                  color: "#042F2E",
                  fontSize: 16,
                  fontWeight: "600",
                  lineHeight: 20,
                }}
              >
                {historyCopy.empty_cta}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {showList ? (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <HistorySessionRow
                session={item}
                onPress={onResumeSession}
              />
            )}
            getItemLayout={(_, index) => ({
              length: 84,
              offset: 84 * index,
              index,
            })}
            contentContainerStyle={{ paddingBottom: 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void load({ soft: true });
                }}
                tintColor="#2DD4BF"
                colors={["#2DD4BF"]}
              />
            }
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}
