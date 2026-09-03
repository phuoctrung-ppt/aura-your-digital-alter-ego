import { Pressable, Text, View } from "react-native";
import { commonCopy } from "../../../lib/i18n";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type ErrorBannerProps = {
  message: string;
  onRetry?: () => void;
};

/** Inline error banner — soft danger wash + danger-ink + optional Thử lại (accent-ink). */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  return (
    <View
      accessibilityRole="alert"
      style={{
        marginBottom: 12,
        width: "100%",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.dangerBorder,
        backgroundColor: colors.dangerWash,
        paddingHorizontal: 12,
        paddingVertical: 12,
      }}
    >
      <Text
        style={{
          color: colors.dangerInk,
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
              color: colors.accentInk,
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
