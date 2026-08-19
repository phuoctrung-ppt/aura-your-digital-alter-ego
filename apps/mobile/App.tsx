import "./global.css";

import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LoginScreen, RegisterScreen } from "./src/features/auth";
import { SessionProvider, useSession } from "./src/lib/session";

type AuthGateScreen = "login" | "register";

/**
 * M2 auth gate — SessionProvider + local screen switch (expo-router lands in M7).
 * DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 */
function AuthenticatedStub() {
  const { user, logout } = useSession();
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView className="flex-1 bg-app px-5" edges={["top", "bottom"]}>
      <View className="flex-1 items-center justify-center">
        <Text className="mb-2 text-display text-ink">Aura</Text>
        <Text className="mb-6 text-center text-body text-ink-secondary">
          Đã đăng nhập
        </Text>
        <Text className="mb-8 text-center text-meta text-ink-muted">
          {user?.email}
        </Text>
        <Pressable
          onPress={() => {
            setBusy(true);
            void logout().finally(() => setBusy(false));
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Đăng xuất"
          className="h-12 min-w-[160px] items-center justify-center rounded-md border border-border-strong px-4"
        >
          {busy ? (
            <ActivityIndicator color="#F5F7FA" />
          ) : (
            <Text className="text-button text-ink">Đăng xuất</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function HydratingSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-app">
      <ActivityIndicator color="#2DD4BF" size="large" />
    </View>
  );
}

function RootGate() {
  const { isAuthenticated, isHydrating } = useSession();
  const [authScreen, setAuthScreen] = useState<AuthGateScreen>("login");

  if (isHydrating) {
    return <HydratingSplash />;
  }

  if (isAuthenticated) {
    return <AuthenticatedStub />;
  }

  if (authScreen === "register") {
    return (
      <RegisterScreen onGoLogin={() => setAuthScreen("login")} />
    );
  }

  return (
    <LoginScreen onGoRegister={() => setAuthScreen("register")} />
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RootGate />
        <StatusBar style="light" />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
