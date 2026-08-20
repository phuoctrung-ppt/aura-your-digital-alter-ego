import { useRouter } from "expo-router";
import { HistoryScreen } from "../../src/features/history";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

export default function HistoryTab() {
  const router = useRouter();
  return (
    <HistoryScreen
      onGoHome={() => {
        router.push("/(tabs)");
      }}
    />
  );
}
