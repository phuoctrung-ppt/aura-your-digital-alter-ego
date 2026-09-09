import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { historyApi } from "../../../lib/api";
import { isApiMockEnabled } from "../../../lib/config";
import { commonCopy, settingsCopy } from "../../../lib/i18n";
import { useSession } from "../../../lib/session";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";
import { AppearanceSection } from "../components/AppearanceSection";
import { WipeHistorySheet } from "../components/WipeHistorySheet";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/**
 * Settings — appearance, account email, history wipe sheet, logout.
 * Dual-theme chrome via chromeColors(resolved). Rows minH 52; wipe uses danger.
 */
export function SettingsScreen() {
  const { user, logout } = useSession();
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);

  const onConfirmWipe = useCallback(async () => {
    if (wipeBusy) return;
    setWipeBusy(true);
    try {
      if (!isApiMockEnabled()) {
        await historyApi.deleteHistory();
      }
      setWipeOpen(false);
      Alert.alert(settingsCopy.wipe_success);
    } catch {
      // Keep sheet open; generic failure — no server dump.
      Alert.alert(settingsCopy.wipe_title, commonCopy.retry);
    } finally {
      setWipeBusy(false);
    }
  }, [wipeBusy]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bgApp }}
      edges={["top"]}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Text
          style={{
            marginBottom: 24,
            color: colors.text,
            fontSize: 24,
            fontWeight: "600",
            lineHeight: 30,
          }}
        >
          {settingsCopy.title}
        </Text>

        <Text
          style={{
            marginBottom: 8,
            color: colors.textMuted,
            fontSize: 13,
            fontWeight: "500",
            lineHeight: 18,
          }}
        >
          {settingsCopy.section_account}
        </Text>
        <View
          style={{
            marginBottom: 24,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.bgElevated,
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 52,
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 13,
              fontWeight: "500",
              lineHeight: 18,
            }}
          >
            {settingsCopy.email}
          </Text>
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "400",
              lineHeight: 24,
            }}
          >
            {user?.email ?? "—"}
          </Text>
        </View>

        <AppearanceSection />

        <Text
          style={{
            marginBottom: 8,
            color: colors.textMuted,
            fontSize: 13,
            fontWeight: "500",
            lineHeight: 18,
          }}
        >
          {settingsCopy.section_privacy}
        </Text>
        <Pressable
          onPress={() => setWipeOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={settingsCopy.wipe_row}
          style={{
            marginBottom: 24,
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 16,
              fontWeight: "600",
              lineHeight: 20,
            }}
          >
            {settingsCopy.wipe_row}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setBusy(true);
            void logout().finally(() => setBusy(false));
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={settingsCopy.logout}
          style={{
            height: 48,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            paddingHorizontal: 16,
            opacity: busy ? 0.4 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text
              style={{
                color: colors.text,
                fontSize: 16,
                fontWeight: "600",
                lineHeight: 20,
              }}
            >
              {settingsCopy.logout}
            </Text>
          )}
        </Pressable>
      </View>

      <WipeHistorySheet
        visible={wipeOpen}
        busy={wipeBusy}
        onCancel={() => {
          if (!wipeBusy) setWipeOpen(false);
        }}
        onConfirm={() => {
          void onConfirmWipe();
        }}
      />
    </SafeAreaView>
  );
}
