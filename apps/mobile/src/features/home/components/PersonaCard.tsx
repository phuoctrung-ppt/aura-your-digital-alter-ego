import { Pressable, Text, View } from "react-native";
import type { Persona, PersonaSlug } from "@aura/contracts";
import { homeCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type PersonaCardProps = {
  persona: Persona;
  onPress?: (slug: PersonaSlug) => void;
  disabled?: boolean;
  busy?: boolean;
};

function blurbFor(slug: PersonaSlug): string {
  if (slug === "tough-interviewer") {
    return homeCopy.persona.tough_interviewer.blurb;
  }
  return homeCopy.persona.native_buddy.blurb;
}

function glyphFor(slug: PersonaSlug): string {
  return slug === "tough-interviewer" ? "TI" : "NB";
}

/**
 * Home persona card — Design Contract:
 * radius 16, padding 20, min-height 120, border 1, elevated fill.
 * Identity via icon_label (monochrome glyph) — not multicolor accents.
 */
export function PersonaCard({
  persona,
  onPress,
  disabled,
  busy,
}: PersonaCardProps) {
  return (
    <Pressable
      onPress={() => onPress?.(persona.slug)}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={persona.name}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => ({
        minHeight: 120,
        borderRadius: 16,
        borderWidth: pressed ? 2 : 1,
        borderColor: pressed ? "#2DD4BF" : "#243047",
        backgroundColor: pressed ? "#1B2538" : "#141C2E",
        padding: 20,
        marginBottom: 16,
        opacity: disabled || busy ? 0.4 : 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
      })}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: "#1B2538",
          borderWidth: 1,
          borderColor: "#33415C",
          alignItems: "center",
          justifyContent: "center",
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={{
            color: "#F5F7FA",
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 22,
          }}
        >
          {glyphFor(persona.slug)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: "#F5F7FA",
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 22,
            marginBottom: 4,
          }}
        >
          {persona.name}
        </Text>
        <Text
          style={{
            color: "#A8B3C7",
            fontSize: 16,
            fontWeight: "400",
            lineHeight: 24,
          }}
        >
          {blurbFor(persona.slug)}
        </Text>
      </View>
    </Pressable>
  );
}
