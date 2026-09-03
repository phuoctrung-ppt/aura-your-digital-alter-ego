import { useRouter } from "expo-router";
import { RegisterScreen } from "../../src/features/auth";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

export default function RegisterRoute() {
  const router = useRouter();
  return (
    <RegisterScreen
      onGoLogin={() => {
        router.replace("/(auth)/login");
      }}
    />
  );
}
