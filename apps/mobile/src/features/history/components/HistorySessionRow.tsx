import { Pressable, Text, View } from "react-native";
import type { Session } from "@aura/contracts";
import { historyCopy, personaLabel } from "../../../lib/i18n";
import {
  chromeColors,
  personaTint,
  useResolvedTheme,
} from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: History row — minH 88 · radius 16 · glass · glyph 40 · tint hairline
// Session has no memory fields — do not invent fake memory tags.

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

function glyphFor(slug: Session["personaSlug"]): string {
  return slug === "tough-interviewer" ? "TI" : "NB";
}

/**
 * History list row — glass card + left persona glyph + compact date/turn meta.
 * Active/recent sessions get a subtle tint top hairline (no fake memories).
 * Press resumes `/session/[id]` via parent callback.
 */
export function HistorySessionRow({
  session,
  turnCount,
  onPress,
}: HistorySessionRowProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);
  const name = personaLabel(session.personaSlug);
  const turns = turnCount ?? session.turnCount ?? 0;
  const meta = historyCopy.row_meta
    .replace("{date}", formatSessionDate(session.startedAt))
    .replace("{turns}", String(turns));
  const tint =
    session.personaSlug === "tough-interviewer" ||
    session.personaSlug === "native-buddy"
      ? personaTint(resolved, session.personaSlug)
      : colors.accentInk;
  const showTintHairline = session.status === "open" || !session.endedAt;

  return (
    <Pressable
      onPress={() => onPress?.(session)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      style={({ pressed }) => ({
        minHeight: 88,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: pressed ? colors.accentGlow : colors.glassBorder,
        backgroundColor: pressed ? colors.bgMuted : colors.glassFill,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 12,
        overflow: "hidden",
      })}
    >
      {showTintHairline ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 24,
            right: 24,
            height: 2,
            borderRadius: 9999,
            backgroundColor: tint,
            opacity: 0.55,
          }}
        />
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 64,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: tint,
            backgroundColor: colors.accentMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 13,
              fontWeight: "700",
              lineHeight: 18,
            }}
          >
            {glyphFor(session.personaSlug)}
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: "600",
              lineHeight: 22,
              marginBottom: 4,
            }}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 13,
              fontWeight: "500",
              lineHeight: 18,
            }}
            numberOfLines={1}
          >
            {meta}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
