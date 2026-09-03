import { useRouter } from "expo-router";
import { LoginScreen } from "../../src/features/auth";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

export default function LoginRoute() {
  const router = useRouter();
  return (
    <LoginScreen
      onGoRegister={() => {
        router.push("/(auth)/register");
      }}
    />
  );
}
