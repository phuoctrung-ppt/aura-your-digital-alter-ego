import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ApiError } from "../../../lib/api/client";
import { useSession } from "../../../lib/session/session-context";
import { AuthErrorBanner } from "../components/AuthErrorBanner";
import { AuthFormShell } from "../components/AuthFormShell";
import { AuthPrimaryButton } from "../components/AuthPrimaryButton";
import { AuthTextField } from "../components/AuthTextField";
import { PasswordField } from "../components/PasswordField";
import { authCopy } from "../copy";

type RegisterScreenProps = {
  onGoLogin: () => void;
};

function mapRegisterError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "EMAIL_TAKEN") {
      return authCopy.error_email_taken;
    }
    if (err.code === "INVALID_CREDENTIALS") {
      return authCopy.error_invalid;
    }
    if (err.code === "VALIDATION_ERROR") {
      return authCopy.error_generic;
    }
  }
  return authCopy.error_generic;
}

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/**
 * Auth Register — same layout as login; confirm password client-side match.
 * Primary Tạo tài khoản; secondary link → login.
 */
export function RegisterScreen({ onGoLogin }: RegisterScreenProps) {
  const { register } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError(authCopy.error_generic);
      return;
    }
    if (password !== confirm) {
      setError(authCopy.error_password_mismatch);
      return;
    }
    if (password.length < 8) {
      setError(authCopy.error_generic);
      return;
    }

    setLoading(true);
    try {
      await register(trimmed, password);
    } catch (err) {
      setError(mapRegisterError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormShell title={authCopy.register_cta}>
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
        />

        <PasswordField
          label={authCopy.password_label}
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
          editable={!loading}
        />

        <PasswordField
          label={authCopy.password_confirm_label}
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="go"
          onSubmitEditing={() => {
            void onSubmit();
          }}
          editable={!loading}
        />
      </View>

      <View className="mt-6 w-full">
        <AuthPrimaryButton
          label={authCopy.register_cta}
          onPress={() => {
            void onSubmit();
          }}
          loading={loading}
        />
      </View>

      <View
        className="mt-4 flex-row flex-wrap items-center justify-center gap-1"
        style={{ minHeight: 44 }}
      >
        <Text className="text-body text-ink-secondary">
          {authCopy.have_account}
        </Text>
        <Pressable
          onPress={onGoLogin}
          accessibilityRole="link"
          accessibilityLabel={authCopy.go_login}
          hitSlop={8}
          className="justify-center px-1"
          style={{ minHeight: 44 }}
        >
          <Text className="text-section text-ink">{authCopy.go_login}</Text>
        </Pressable>
      </View>
    </AuthFormShell>
  );
}
