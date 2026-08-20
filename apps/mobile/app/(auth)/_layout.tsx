import { Redirect, Stack } from "expo-router";
import { useSession } from "../../src/lib/session";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

/**
 * Auth stack (no tabs) — login / register.
 */
export default function AuthLayout() {
  const { isAuthenticated } = useSession();

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B1220" } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
