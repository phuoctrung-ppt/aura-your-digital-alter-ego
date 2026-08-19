import type { PropsWithChildren } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { authCopy } from "../copy";

type AuthFormShellProps = PropsWithChildren<{
  /** Screen title — e.g. login_cta / register_cta from authCopy */
  title: string;
}>;

/**
 * Auth chrome — mobile_stack shell.
 * Layout: SafeArea, pad-x 20, display wordmark, tagline, title, children.
 * Spec: docs/design/2026-08-17-aura-mobile-mvp.spec.md + wire §1.
 */
export function AuthFormShell({ title, children }: AuthFormShellProps) {
  return (
    <SafeAreaView className="flex-1 bg-app" edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="flex-grow justify-center px-5 py-6"
          className="flex-1"
        >
          <View className="w-full items-center">
            <Text className="text-display text-ink">{authCopy.brand}</Text>
            <Text className="mt-2 text-center text-body text-ink-secondary">
              {authCopy.tagline}
            </Text>
            <Text className="mb-6 mt-6 self-start text-title text-ink">
              {title}
            </Text>
          </View>
          <View className="w-full">{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
