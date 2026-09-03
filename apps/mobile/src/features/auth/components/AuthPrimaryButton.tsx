import {
  ActivityIndicator,
  Pressable,
  Text,
  type GestureResponderEvent,
} from "react-native";

type AuthPrimaryButtonProps = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Stable Maestro / Detox selector (optional). */
  testID?: string;
};

/**
 * Primary CTA — h=52, radius 12, accent fill, text-on-accent, full width.
 * Loading = spinner on button (states.loading auth).
 */
export function AuthPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  testID,
}: AuthPrimaryButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
      className={`h-[52px] w-full items-center justify-center rounded-md bg-accent ${
        isDisabled ? "opacity-40" : "active:bg-accent-pressed"
      }`}
    >
      {loading ? (
        <ActivityIndicator color="#042F2E" />
      ) : (
        <Text className="text-button text-ink-on-accent">{label}</Text>
      )}
    </Pressable>
  );
}
