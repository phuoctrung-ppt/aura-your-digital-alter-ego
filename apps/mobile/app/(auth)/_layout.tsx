import { Redirect, Stack } from "expo-router";
import { useSession } from "../../src/lib/session";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/**
 * Auth stack (no tabs) — login / register.
 * Default canvas navy #040d1a; ThemeProvider owns dual-theme chrome.
 */
export default function AuthLayout() {
  const { isAuthenticated } = useSession();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#040d1a" },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
