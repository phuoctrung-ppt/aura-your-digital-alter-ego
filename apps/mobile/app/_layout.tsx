import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/lib/session";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

function HydratingSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-app">
      <ActivityIndicator color="#2DD4BF" size="large" />
    </View>
  );
}

/**
 * Root stack — auth | tabs | session.
 * Auth gate redirects live in index + group layouts.
 */
function RootNavigator() {
  const { isHydrating } = useSession();

  if (isHydrating) {
    return <HydratingSplash />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B1220" } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="session/[id]"
        options={{ animation: "slide_from_right", gestureEnabled: true }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SessionProvider>
          <RootNavigator />
          <StatusBar style="light" />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
