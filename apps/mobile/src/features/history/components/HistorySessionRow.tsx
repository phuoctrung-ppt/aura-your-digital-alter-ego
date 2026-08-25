import { Pressable, Text } from "react-native";
import type { Session } from "@aura/contracts";
import { historyCopy, personaLabel } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: History row — h≈72, persona label + row_meta `{date} · {turns} lượt`

type HistorySessionRowProps = {
  session: Session;
  /** Optional turn count override when Session.turnCount is absent. */
  turnCount?: number;
  onPress?: (session: Session) => void;
};

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso.slice(0, 10);
  }
  return date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * History list row — persona display name + compact date/turn meta.
 * Press resumes `/session/[id]` via parent callback.
 */
export function HistorySessionRow({
  session,
  turnCount,
  onPress,
}: HistorySessionRowProps) {
  const name = personaLabel(session.personaSlug);
  const turns = turnCount ?? session.turnCount ?? 0;
  const meta = historyCopy.row_meta
    .replace("{date}", formatSessionDate(session.startedAt))
    .replace("{turns}", String(turns));

  return (
    <Pressable
      onPress={() => onPress?.(session)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      style={{
        minHeight: 72,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#243047",
        backgroundColor: "#141C2E",
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 12,
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          color: "#F5F7FA",
          fontSize: 16,
          fontWeight: "600",
          lineHeight: 22,
          marginBottom: 4,
        }}
      >
        {name}
      </Text>
      <Text
        style={{
          color: "#A8B3C7",
          fontSize: 14,
          fontWeight: "400",
          lineHeight: 20,
        }}
      >
        {meta}
      </Text>
    </Pressable>
  );
}
