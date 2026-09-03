import { Linking, Pressable, Text, View } from "react-native";
import type { SafetyResource } from "@aura/contracts";
import { safetyCopy } from "../../../lib/i18n";
import { stageColors } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: info_calm · padding 12 · radius 12 · dismiss "Đã hiểu"
// DESIGN-GATE: PTT remains usable while banner is visible (session owner)

type SafetyBannerProps = {
  onDismiss?: () => void;
  resources?: SafetyResource[];
};

/**
 * Safety mode banner (safe-listener) — calm info tone on force_dark stage.
 * Prefers server `safetyResources`; falls back to local `safetyCopy` phones.
 * PTT must remain holdable while this is visible.
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          marginBottom: 4,
          gap: 8,
        }}
      >
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={{
            color: stageColors.info,
            fontSize: 16,
            fontWeight: "700",
            lineHeight: 20,
            width: 20,
            height: 20,
            textAlign: "center",
          }}
        >
          i
        </Text>
        <Text
          style={{
            flex: 1,
            color: stageColors.text,
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 22,
          }}
        >
          {safetyCopy.title}
        </Text>
      </View>
      <Text
        style={{
          color: stageColors.textSecondary,
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
              color: stageColors.info,
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
          borderColor: stageColors.borderStrong,
          paddingHorizontal: 12,
        }}
      >
        <Text
          style={{
            color: stageColors.textSecondary,
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
