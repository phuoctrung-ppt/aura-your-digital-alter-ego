import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { settingsCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type WipeHistorySheetProps = {
  visible: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Wipe confirmation sheet — destructive confirm enabled (M9).
 * Parent owns API call + success feedback; busy blocks double-submit.
 */
export function WipeHistorySheet({
  visible,
  busy = false,
  onCancel,
  onConfirm,
}: WipeHistorySheetProps) {
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
          backgroundColor: "rgba(11, 18, 32, 0.72)",
        }}
      >
        <View
          style={{
            width: "100%",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: "#141C2E",
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
          }}
        >
          <Text
            style={{
              marginBottom: 8,
              color: "#F5F7FA",
              fontSize: 22,
              fontWeight: "600",
              lineHeight: 28,
            }}
          >
            {settingsCopy.wipe_title}
          </Text>
          <Text
            style={{
              marginBottom: 24,
              color: "#A8B3C7",
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
              borderColor: "#33415C",
              opacity: busy ? 0.5 : 1,
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
              borderWidth: 1,
              borderColor: "rgba(248, 113, 113, 0.5)",
              backgroundColor: "rgba(248, 113, 113, 0.1)",
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#F87171" />
            ) : (
              <Text
                style={{
                  color: "#F87171",
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
