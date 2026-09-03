import { Text, View } from "react-native";
import { useResolvedTheme, chromeColors } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type AuthErrorBannerProps = {
  message: string;
};

/**
 * Inline error banner — states.error = soft danger wash + danger-ink text.
 */
export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  return (
    <View
      className="mb-4 w-full rounded-md px-3 py-3"
      style={{
        backgroundColor: colors.dangerWash,
        borderWidth: 1,
        borderColor: colors.dangerBorder,
      }}
      accessibilityRole="alert"
    >
      <Text
        className="text-body"
        style={{ color: colors.dangerInk }}
      >
        {message}
      </Text>
    </View>
  );
}
