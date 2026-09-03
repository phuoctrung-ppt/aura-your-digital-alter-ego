import "../global.css";

import { Stack } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "../src/lib/session";
import { SPLASH_BG, ThemeProvider } from "../src/lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

function HydratingSplash() {
  return (
    <View
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: SPLASH_BG }}
    >
      <ActivityIndicator color="#00e5ff" size="large" />
    </View>
  );
}

/**
 * Root stack — auth | tabs | session.
 * Auth gate redirects live in index + group layouts.
 * ThemeProvider resolves system/light/dark + NativeWind class mode.
 */
function RootNavigator() {
  const { isHydrating } = useSession();

  if (isHydrating) {
    return <HydratingSplash />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Splash / default stack canvas stays dark; ThemeProvider owns chrome canvas.
        contentStyle: { backgroundColor: SPLASH_BG },
      }}
    >
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
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
