import { Pressable, Text, View } from "react-native";
import { commonCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

/** Inline error banner — soft danger wash + optional Thử lại. */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginBottom: 12,
        width: "100%",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(248, 113, 113, 0.4)",
        backgroundColor: "rgba(248, 113, 113, 0.14)",
        paddingHorizontal: 12,
        paddingVertical: 12,
      }}
    >
      <Text
        style={{
          color: "#F87171",
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {message}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={commonCopy.retry}
          style={{
            marginTop: 8,
            minHeight: 44,
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#2DD4BF",
              fontSize: 16,
              fontWeight: "600",
              lineHeight: 20,
            }}
          >
            {commonCopy.retry}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
