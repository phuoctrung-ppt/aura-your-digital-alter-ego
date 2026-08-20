import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { historyCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type HistoryScreenProps = {
  /** empty_never CTA → home tab. */
  onGoHome?: () => void;
};

/**
 * History — empty_never CTA for M7 (full list is M9).
 * Layout: pad 20, page title 22, primary CTA accent.
 */
export function HistoryScreen({ onGoHome }: HistoryScreenProps) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B1220" }} edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 16, flex: 1 }}>
        <Text
          style={{
            marginBottom: 24,
            color: "#F5F7FA",
            fontSize: 22,
            fontWeight: "600",
            lineHeight: 28,
          }}
        >
          {historyCopy.title}
        </Text>

        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 8,
          }}
        >
          <Text
            style={{
              marginBottom: 8,
              textAlign: "center",
              color: "#F5F7FA",
              fontSize: 16,
              fontWeight: "600",
              lineHeight: 22,
            }}
          >
            {historyCopy.empty_title}
          </Text>
          <Text
            style={{
              marginBottom: 24,
              textAlign: "center",
              color: "#A8B3C7",
              fontSize: 16,
              fontWeight: "400",
              lineHeight: 24,
            }}
          >
            {historyCopy.empty_body}
          </Text>
          <Pressable
            onPress={onGoHome}
            accessibilityRole="button"
            accessibilityLabel={historyCopy.empty_cta}
            style={{
              height: 52,
              minWidth: 160,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: "#2DD4BF",
              paddingHorizontal: 16,
            }}
          >
            <Text
              style={{
                color: "#042F2E",
                fontSize: 16,
                fontWeight: "600",
                lineHeight: 20,
              }}
            >
              {historyCopy.empty_cta}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
