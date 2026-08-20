import { Linking, Modal, Pressable, Text, View } from "react-native";
import { sessionCopy, commonCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type MicPermissionSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** Shown when mic permission is denied — VN copy from Design Contract. */
export function MicPermissionSheet({
  visible,
  onClose,
}: MicPermissionSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
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
              color: "#F5F7FA",
              fontSize: 22,
              fontWeight: "600",
              lineHeight: 28,
              marginBottom: 8,
            }}
          >
            {sessionCopy.mic_permission_title}
          </Text>
          <Text
            style={{
              color: "#A8B3C7",
              fontSize: 16,
              fontWeight: "400",
              lineHeight: 24,
              marginBottom: 24,
            }}
          >
            {sessionCopy.mic_permission_body}
          </Text>
          <Pressable
            onPress={() => {
              void Linking.openSettings();
            }}
            accessibilityRole="button"
            accessibilityLabel={sessionCopy.mic_permission_cta}
            style={{
              height: 52,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#2DD4BF",
              marginBottom: 12,
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
              {sessionCopy.mic_permission_cta}
            </Text>
          </Pressable>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={commonCopy.cancel}
            style={{
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              borderWidth: 1,
              borderColor: "#33415C",
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
              {commonCopy.cancel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
