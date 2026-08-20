import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { networkCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
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
  const body = (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0B1220",
        paddingHorizontal: 20,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          backgroundColor: "#1B2538",
          borderWidth: 1,
          borderColor: "#33415C",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={{ color: "#6B7A94", fontSize: 22, fontWeight: "600" }}>
          ⌁
        </Text>
      </View>
      <Text
        style={{
          color: "#F5F7FA",
          fontSize: 22,
          fontWeight: "600",
          lineHeight: 28,
          marginBottom: 8,
          textAlign: "center",
        }}
      >
        {networkCopy.title}
      </Text>
      <Text
        style={{
          color: "#A8B3C7",
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
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#33415C",
          paddingHorizontal: 16,
        }}
      >
        <Text
          style={{
            color: "#F5F7FA",
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      {body}
    </SafeAreaView>
  );
}
