import { Pressable, Text, View } from "react-native";
import type { PersonaLanguage } from "@aura/contracts";
import { homeCopy } from "../../../lib/i18n";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-09-03-calling-ui.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: language_picker home_pre_session · segmented_inline · h 36 · hit ≥44 · default vi

type LanguagePickerProps = {
  /** Languages from persona.supportedLanguages only. */
  options: readonly PersonaLanguage[];
  value: PersonaLanguage;
  onChange: (locale: PersonaLanguage) => void;
  disabled?: boolean;
  /** Optional testID override — default `session-language-picker`. */
  testID?: string;
};

const LABEL: Record<PersonaLanguage, string> = {
  vi: homeCopy.language.vi,
  en: homeCopy.language.en,
};

/**
 * Inline segmented reply-language control for Home heroes.
 * Mid-call switch is forbidden — this lives only at session start.
 */
export function LanguagePicker({
  options,
  value,
  onChange,
  disabled,
  testID = "session-language-picker",
}: LanguagePickerProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);
  const langs = options.length > 0 ? options : (["vi"] as const);

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={homeCopy.language.a11y}
      style={{
        marginTop: 12,
        marginBottom: 4,
      }}
    >
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
          marginBottom: 8,
        }}
      >
        {homeCopy.language.label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          alignSelf: "flex-start",
          height: 36,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.glassBorder,
          backgroundColor: colors.bgMuted,
          overflow: "hidden",
          opacity: disabled ? 0.45 : 1,
        }}
      >
        {langs.map((lang) => {
          const selected = lang === value;
          return (
            <Pressable
              key={lang}
              onPress={() => onChange(lang)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={LABEL[lang]}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              style={{
                minWidth: 56,
                minHeight: 36,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: selected ? colors.accentMuted : "transparent",
                borderRightWidth: lang === langs[langs.length - 1] ? 0 : 1,
                borderRightColor: colors.glassBorder,
              }}
            >
              <Text
                style={{
                  color: selected ? colors.accentInk : colors.textSecondary,
                  fontSize: 13,
                  fontWeight: selected ? "600" : "500",
                  lineHeight: 18,
                }}
              >
                {lang === "vi" ? "VI" : "EN"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
