import { Pressable, Text, View } from "react-native";
import type { Persona, PersonaLanguage, PersonaSlug } from "@aura/contracts";
import { homeCopy } from "../../../lib/i18n";
import {
  chromeColors,
  personaTint,
  useResolvedTheme,
} from "../../../lib/theme";
import { LanguagePicker } from "./LanguagePicker";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: dual_portrait unchanged; language segmented delta at start only

type PersonaCardProps = {
  persona: Persona;
  onPress?: (slug: PersonaSlug, locale: PersonaLanguage) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Reply locale selected for this hero (Home-owned). */
  locale: PersonaLanguage;
  onLocaleChange?: (slug: PersonaSlug, locale: PersonaLanguage) => void;
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
 * Home persona hero — dual_portrait (UI v3):
 * minH 220, portrait block 140, radius 20, pad 16, glass surface.
 * Persona tint wash NON-CTA (interviewer cyan / buddy violet).
 * Press: 2px accent ring. Full-card hit. testID persona-{slug}.
 */
export function PersonaCard({
  persona,
  onPress,
  disabled,
  busy,
  locale,
  onLocaleChange,
}: PersonaCardProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);
  const tint =
    persona.slug === "tough-interviewer" || persona.slug === "native-buddy"
      ? personaTint(resolved, persona.slug)
      : colors.accentInk;
  const languages = persona.supportedLanguages;

  return (
    <Pressable
      testID={`persona-${persona.slug}`}
      onPress={() => onPress?.(persona.slug, locale)}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={`${persona.name}. ${homeCopy.persona.start_chip}`}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => ({
        minHeight: 220,
        borderRadius: 20,
        borderWidth: pressed ? 2 : 1,
        borderColor: pressed ? colors.accent : colors.glassBorder,
        backgroundColor: colors.glassFill,
        padding: 16,
        marginBottom: 16,
        opacity: disabled || busy ? 0.4 : 1,
        overflow: "hidden",
        position: "relative",
      })}
    >
      {/* Non-interactive corner tint wash (mockup radial approx) */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -48,
          right: -48,
          width: 160,
          height: 160,
          borderRadius: 9999,
          backgroundColor: tint,
          opacity: 0.2,
        }}
      />

      <View
        style={{
          height: 140,
          borderRadius: 12,
          backgroundColor: colors.bgMuted,
          borderWidth: 1,
          borderColor: tint,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
          opacity: 0.95,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            borderWidth: 2,
            borderColor: tint,
            backgroundColor: colors.accentMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontSize: 24,
              fontWeight: "700",
              lineHeight: 30,
            }}
          >
            {glyphFor(persona.slug)}
          </Text>
        </View>
      </View>

      {/* Capture touches so language taps do not fire full-card start */}
      <View onStartShouldSetResponder={() => true}>
        <LanguagePicker
          options={languages}
          value={locale}
          disabled={disabled || busy}
          testID="session-language-picker"
          onChange={(next) => onLocaleChange?.(persona.slug, next)}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: colors.text,
              fontSize: 17,
              fontWeight: "600",
              lineHeight: 22,
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {persona.name}
          </Text>
          <Text
            style={{
              color: colors.textSecondary,
              fontSize: 16,
              fontWeight: "400",
              lineHeight: 24,
            }}
            numberOfLines={2}
          >
            {blurbFor(persona.slug)}
          </Text>
        </View>

        <View
          style={{
            marginTop: 2,
            borderRadius: 9999,
            borderWidth: 1,
            borderColor: tint,
            backgroundColor: colors.accentMuted,
            paddingHorizontal: 10,
            paddingVertical: 4,
            minHeight: 28,
            justifyContent: "center",
          }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Text
            style={{
              color: tint,
              fontSize: 13,
              fontWeight: "500",
              lineHeight: 18,
            }}
          >
            {homeCopy.persona.start_chip}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
