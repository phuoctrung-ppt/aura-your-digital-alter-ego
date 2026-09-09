import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { settingsCopy } from "../../../lib/i18n";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: sheet radius 28 · destructive = danger (not accent)

type WipeHistorySheetProps = {
  visible: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Wipe confirmation sheet — radius 28, dual-theme scrim + elevated panel.
 * Parent owns API call + success feedback; busy blocks double-submit.
 */
export function WipeHistorySheet({
  visible,
  busy = false,
  onCancel,
  onConfirm,
}: WipeHistorySheetProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel();
      }}
    >
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "flex-end",
          backgroundColor: colors.bgOverlay,
        }}
      >
        <View
          style={{
            width: "100%",
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: colors.bgElevated,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
          }}
        >
          <Text
            style={{
              marginBottom: 8,
              color: colors.text,
              fontSize: 24,
              fontWeight: "600",
              lineHeight: 30,
            }}
          >
            {settingsCopy.wipe_title}
          </Text>
          <Text
            style={{
              marginBottom: 24,
              color: colors.textSecondary,
              fontSize: 16,
              fontWeight: "400",
              lineHeight: 24,
            }}
          >
            {settingsCopy.wipe_body}
          </Text>
          <Pressable
            onPress={onCancel}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            accessibilityLabel={settingsCopy.wipe_cancel}
            style={{
              marginBottom: 12,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              opacity: busy ? 0.5 : 1,
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
              {settingsCopy.wipe_cancel}
            </Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={settingsCopy.wipe_confirm}
            style={{
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: colors.danger,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnDanger} />
            ) : (
              <Text
                style={{
                  color: colors.textOnDanger,
                  fontSize: 16,
                  fontWeight: "600",
                  lineHeight: 20,
                }}
              >
                {settingsCopy.wipe_confirm}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
