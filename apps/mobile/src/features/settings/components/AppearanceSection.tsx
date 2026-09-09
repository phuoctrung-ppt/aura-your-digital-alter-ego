/**
 * Appearance section — system / light / dark preference.
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 *
 * Segmented rows (minH 52). Dual-theme tokens via chromeColors.
 */

import { Pressable, Text, View } from "react-native";
import { settingsCopy } from "../../../lib/i18n";
import {
  chromeColors,
  useResolvedTheme,
  type AppearancePreference,
} from "../../../lib/theme";

const OPTIONS: {
  value: AppearancePreference;
  label: string;
  testID: string;
}[] = [
  {
    value: "system",
    label: settingsCopy.appearance_system,
    testID: "settings-appearance-system",
  },
  {
    value: "light",
    label: settingsCopy.appearance_light,
    testID: "settings-appearance-light",
  },
  {
    value: "dark",
    label: settingsCopy.appearance_dark,
    testID: "settings-appearance-dark",
  },
];

export function AppearanceSection() {
  const { appearance, setAppearance, isHydrating, resolved } =
    useResolvedTheme();
  const colors = chromeColors(resolved);

  return (
    <View style={{ marginBottom: 24 }} testID="settings-appearance-section">
      <Text
        style={{
          marginBottom: 8,
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {settingsCopy.section_appearance}
      </Text>

      <Text
        style={{
          marginBottom: 8,
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {settingsCopy.appearance_label}
      </Text>

      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgElevated,
          overflow: "hidden",
          opacity: isHydrating ? 0.6 : 1,
        }}
      >
        {OPTIONS.map((option, index) => {
          const selected = appearance === option.value;
          return (
            <Pressable
              key={option.value}
              testID={option.testID}
              disabled={isHydrating}
              onPress={() => {
                void setAppearance(option.value);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: isHydrating }}
              accessibilityLabel={option.label}
              style={{
                minHeight: 52,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderTopWidth: index === 0 ? 0 : 1,
                borderTopColor: colors.border,
                backgroundColor: selected ? colors.bgMuted : "transparent",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: 16,
                  fontWeight: selected ? "600" : "400",
                  lineHeight: 24,
                }}
              >
                {option.label}
              </Text>
              <Text
                style={{
                  color: selected ? colors.accent : colors.textMuted,
                  fontSize: 16,
                  fontWeight: "600",
                  lineHeight: 20,
                }}
              >
                {selected ? "●" : "○"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
