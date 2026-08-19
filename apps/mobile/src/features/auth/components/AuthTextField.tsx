import type { ReactNode } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

type AuthTextFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** When set, renders secure entry + optional trailing slot (eye toggle). */
  secureTextEntry?: boolean;
  trailing?: ReactNode;
} & Pick<
  TextInputProps,
  | "autoCapitalize"
  | "autoComplete"
  | "autoCorrect"
  | "keyboardType"
  | "textContentType"
  | "returnKeyType"
  | "onSubmitEditing"
  | "editable"
  | "accessibilityLabel"
>;

/**
 * Auth input — Design Contract:
 * height 48, radius 8, pad-x 16, elevated fill, border 1, label visible above (meta).
 */
export function AuthTextField({
  label,
  value,
  onChangeText,
  secureTextEntry,
  trailing,
  accessibilityLabel,
  ...inputProps
}: AuthTextFieldProps) {
  return (
    <View className="w-full">
      <Text
        className="text-meta text-ink-secondary"
        style={{ marginBottom: 6 }}
      >
        {label}
      </Text>
      <View className="h-12 w-full flex-row items-center rounded-sm border border-border bg-elevated px-4">
        <TextInput
          className="flex-1 text-body text-ink"
          style={{ minHeight: 44 }}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          placeholderTextColor="#6B7A94"
          accessibilityLabel={accessibilityLabel ?? label}
          {...inputProps}
        />
        {trailing}
      </View>
    </View>
  );
}
