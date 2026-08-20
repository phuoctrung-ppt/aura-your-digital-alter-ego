import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { settingsCopy } from "../../../lib/i18n";
import { useSession } from "../../../lib/session";
import { WipeHistorySheetStub } from "../components/WipeHistorySheetStub";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/**
 * Settings — account email + logout; wipe sheet soft-disabled until M9.
 */
export function SettingsScreen() {
  const { user, logout } = useSession();
  const [busy, setBusy] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Text
          style={{
            marginBottom: 24,
            color: "#F5F7FA",
            fontSize: 22,
            fontWeight: "600",
            lineHeight: 28,
          }}
        >
          {settingsCopy.title}
        </Text>

        <Text
          style={{
            marginBottom: 8,
            color: "#6B7A94",
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
            borderColor: "#243047",
            backgroundColor: "#141C2E",
            paddingHorizontal: 16,
            paddingVertical: 12,
            minHeight: 52,
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#6B7A94",
              fontSize: 13,
              fontWeight: "500",
              lineHeight: 18,
            }}
          >
            {settingsCopy.email}
          </Text>
          <Text
            style={{
              color: "#F5F7FA",
              fontSize: 16,
              fontWeight: "400",
              lineHeight: 24,
            }}
          >
            {user?.email ?? "—"}
          </Text>
        </View>

        <Text
          style={{
            marginBottom: 8,
            color: "#6B7A94",
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
            borderColor: "#33415C",
            paddingHorizontal: 16,
          }}
        >
          <Text
            style={{
              color: "#F5F7FA",
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
            borderColor: "#33415C",
            paddingHorizontal: 16,
            opacity: busy ? 0.4 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#F5F7FA" />
          ) : (
            <Text
              style={{
                color: "#F5F7FA",
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

      <WipeHistorySheetStub
        visible={wipeOpen}
        onCancel={() => setWipeOpen(false)}
        onConfirm={() => {
          // TODO(M9): DELETE /v1/me/history — soft-disabled confirm for now.
          setWipeOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
