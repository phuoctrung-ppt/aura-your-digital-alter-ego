import { Text, View } from "react-native";

type AuthErrorBannerProps = {
  message: string;
};

/**
 * Inline error banner — states.error = soft danger wash + message.
 * Danger @ 14% per tokens.md.
 */
export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  return (
    <View
      className="mb-4 w-full rounded-md px-3 py-3"
      style={{ backgroundColor: "rgba(248, 113, 113, 0.14)" }}
      accessibilityRole="alert"
    >
      <Text className="text-body text-danger">{message}</Text>
    </View>
  );
}
