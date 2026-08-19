import { useState } from "react";
import { Pressable, Text } from "react-native";
import { authCopy } from "../copy";
import { AuthTextField } from "./AuthTextField";

type PasswordFieldProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  returnKeyType?: "done" | "next" | "go";
  onSubmitEditing?: () => void;
  editable?: boolean;
};

/**
 * Password input with eye toggle — hit target ≥44 (contract + wire).
 */
export function PasswordField({
  label,
  value,
  onChangeText,
  returnKeyType = "done",
  onSubmitEditing,
  editable = true,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <AuthTextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="password"
      textContentType="password"
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      editable={editable}
      trailing={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={
            visible ? authCopy.hide_password : authCopy.show_password
          }
          hitSlop={8}
          className="ml-2 items-center justify-center"
          style={{ width: 44, height: 44 }}
          disabled={!editable}
        >
          <Text className="text-meta font-medium text-ink-secondary">
            {visible ? "Ẩn" : "Hiện"}
          </Text>
        </Pressable>
      }
    />
  );
}
