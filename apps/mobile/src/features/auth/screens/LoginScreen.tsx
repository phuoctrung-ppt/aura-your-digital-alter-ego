import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ApiError } from "../../../lib/api/client";
import { useSession } from "../../../lib/session/session-context";
import { AuthErrorBanner } from "../components/AuthErrorBanner";
import { AuthFormShell } from "../components/AuthFormShell";
import { AuthPrimaryButton } from "../components/AuthPrimaryButton";
import { AuthTextField } from "../components/AuthTextField";
import { PasswordField } from "../components/PasswordField";
import { authCopy } from "../copy";

type LoginScreenProps = {
  onGoRegister: () => void;
};

function mapLoginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "INVALID_CREDENTIALS") {
      return authCopy.error_invalid;
    }
  }
  return authCopy.error_generic;
}

/**
 * Auth Login — wire §1 + design inventory VN copy.
 * email + password, forgot (no-op Alert), primary Đăng nhập, link → register.
 */
export function LoginScreen({ onGoRegister }: LoginScreenProps) {
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError(authCopy.error_generic);
      return;
    }
    setLoading(true);
    try {
      await login(trimmed, password);
    } catch (err) {
      setError(mapLoginError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormShell title={authCopy.login_cta}>
      {error ? <AuthErrorBanner message={error} /> : null}

      <View className="w-full gap-3">
        <AuthTextField
          label={authCopy.email_label}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          editable={!loading}
          testID="login-email"
        />

        <PasswordField
          label={authCopy.password_label}
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={() => {
            void onSubmit();
          }}
          editable={!loading}
          testID="login-password"
        />
      </View>

      <Pressable
        onPress={() => {
          Alert.alert(authCopy.forgot_password, authCopy.forgot_coming_soon);
        }}
        accessibilityRole="button"
        accessibilityLabel={authCopy.forgot_password}
        hitSlop={8}
        className="mt-3 justify-center self-start"
        style={{ minHeight: 44 }}
      >
        <Text className="text-meta text-ink-secondary">
          {authCopy.forgot_password}
        </Text>
      </Pressable>

      <View className="mt-6 w-full">
        <AuthPrimaryButton
          label={authCopy.login_cta}
          onPress={() => {
            void onSubmit();
          }}
          loading={loading}
          testID="login-submit"
        />
      </View>

      <View
        className="mt-4 flex-row flex-wrap items-center justify-center gap-1"
        style={{ minHeight: 44 }}
      >
        <Text className="text-body text-ink-secondary">{authCopy.no_account}</Text>
        <Pressable
          onPress={onGoRegister}
          accessibilityRole="link"
          accessibilityLabel={authCopy.go_register}
          hitSlop={8}
          className="justify-center px-1"
          style={{ minHeight: 44 }}
        >
          <Text className="text-section text-ink">{authCopy.go_register}</Text>
        </Pressable>
      </View>
    </AuthFormShell>
  );
}
