import {
  ActivityIndicator,
  Pressable,
  Text,
  type GestureResponderEvent,
} from "react-native";
import { useResolvedTheme, chromeColors } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type AuthPrimaryButtonProps = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
};

/**
 * Primary CTA — h=52, radius 12, accent fill (cyan family), text-on-accent, full width.
 * Light accent #007A88 (never raw #00e5ff as solid CTA). Loading = spinner on button.
 */
export function AuthPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  testID,
}: AuthPrimaryButtonProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);
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
        <ActivityIndicator color={colors.textOnAccent} />
      ) : (
        <Text className="text-button text-ink-on-accent">{label}</Text>
      )}
    </Pressable>
  );
}
