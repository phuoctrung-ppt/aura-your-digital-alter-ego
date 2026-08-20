import { useRouter } from "expo-router";
import { RegisterScreen } from "../../src/features/auth";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
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
