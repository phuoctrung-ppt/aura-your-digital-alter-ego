import { Linking, Pressable, Text, View } from "react-native";
import type { SafetyResource } from "@aura/contracts";
import { safetyCopy } from "../../../lib/i18n";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

type SafetyBannerProps = {
  onDismiss?: () => void;
  resources?: SafetyResource[];
};

/**
 * Safety mode banner (safe-listener) — calm info tone, PTT remains available.
 */
export function SafetyBanner({ onDismiss, resources }: SafetyBannerProps) {
  const fallbackResources: SafetyResource[] = [
    { title: safetyCopy.resource_child, value: "111", kind: "phone" },
    { title: safetyCopy.resource_emergency, value: "115", kind: "phone" },
  ];
  const items =
    resources && resources.length > 0 ? resources : fallbackResources;

  return (
    <View
      accessibilityRole="alert"
      style={{
        width: "100%",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(56, 189, 248, 0.35)",
        backgroundColor: "rgba(56, 189, 248, 0.14)",
        padding: 12,
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
        {safetyCopy.title}
      </Text>
      <Text
        style={{
          color: "#A8B3C7",
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
          marginBottom: 12,
        }}
      >
        {safetyCopy.body}
      </Text>

      {items.map((item) => (
        <Pressable
          key={`${item.title}-${item.value}`}
          onPress={() => {
            if (item.kind === "phone") {
              void Linking.openURL(`tel:${item.value}`);
            } else if (item.kind === "url") {
              void Linking.openURL(item.value);
            }
          }}
          accessibilityRole={item.kind === "text" ? "text" : "link"}
          accessibilityLabel={`${item.title} ${item.value}`}
          style={{ minHeight: 44, justifyContent: "center", marginBottom: 4 }}
        >
          <Text
            style={{
              color: "#38BDF8",
              fontSize: 13,
              fontWeight: "500",
              lineHeight: 18,
            }}
          >
            {item.title}
            {item.kind !== "text" ? ` · ${item.value}` : ""}
          </Text>
        </Pressable>
      ))}

      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={safetyCopy.dismiss}
        style={{
          marginTop: 8,
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          borderWidth: 1,
          borderColor: "#33415C",
          paddingHorizontal: 12,
        }}
      >
        <Text
          style={{
            color: "#A8B3C7",
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 20,
          }}
        >
          {safetyCopy.dismiss}
        </Text>
      </Pressable>
    </View>
  );
}
