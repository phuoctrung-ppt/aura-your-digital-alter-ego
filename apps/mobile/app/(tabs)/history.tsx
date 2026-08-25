import { useRouter } from "expo-router";
import type { Session } from "@aura/contracts";
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
      onResumeSession={(session: Session) => {
        router.push({
          pathname: "/session/[id]",
          params: {
            id: session.id,
            personaSlug: session.personaSlug,
          },
        });
      }}
    />
  );
}
