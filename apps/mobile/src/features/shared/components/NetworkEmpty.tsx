import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { networkCopy } from "../../../lib/i18n";
import { chromeColors, useResolvedTheme } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type NetworkEmptyProps = {
  onRetry?: () => void;
  /** When true, wrap in SafeAreaView for full-page tab usage. */
  fullPage?: boolean;
};

/**
 * Full-page empty_network — icon + title + body + Thử lại (secondary).
 * Blocks session start / shows on home when offline.
 */
export function NetworkEmpty({ onRetry, fullPage = true }: NetworkEmptyProps) {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  const body = (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.bgApp,
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: colors.bgMuted,
          borderWidth: 1,
          borderColor: colors.glassBorder,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          style={{ color: colors.textMuted, fontSize: 22, fontWeight: "600" }}
        >
          ⌁
        </Text>
      </View>
      <Text
        style={{
          color: colors.text,
          fontSize: 24,
          fontWeight: "600",
          lineHeight: 30,
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        {networkCopy.title}
      </Text>
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 16,
          fontWeight: "400",
          lineHeight: 24,
          marginBottom: 24,
          textAlign: "center",
        }}
      >
        {networkCopy.body}
      </Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={networkCopy.retry}
        style={{
          height: 48,
          minWidth: 160,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          paddingHorizontal: 16,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 20,
          }}
        >
          {networkCopy.retry}
        </Text>
      </Pressable>
    </View>
  );

  if (!fullPage) {
    return body;
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.bgApp }}
      edges={["top"]}
    >
      {body}
    </SafeAreaView>
  );
}
