import { Linking, Modal, Pressable, Text, View } from "react-native";
import { sessionCopy, commonCopy } from "../../../lib/i18n";
import { stageColors } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type MicPermissionSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/** Shown when mic permission is denied — sheet radius 28, stage tokens. */
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
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            backgroundColor: stageColors.elevated,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 32,
          }}
        >
          <Text
            style={{
              color: stageColors.text,
              fontSize: 24,
              fontWeight: "600",
              lineHeight: 30,
              marginBottom: 8,
            }}
          >
            {sessionCopy.mic_permission_title}
          </Text>
          <Text
            style={{
              color: stageColors.textSecondary,
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
              backgroundColor: stageColors.accent,
              marginBottom: 12,
            }}
          >
            <Text
              style={{
                color: stageColors.textOnAccent,
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
              borderColor: stageColors.borderStrong,
            }}
          >
            <Text
              style={{
                color: stageColors.text,
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
