import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { tabsCopy } from "../../src/lib/i18n";
import { useSession } from "../../src/lib/session";
import { chromeColors, useResolvedTheme } from "../../src/lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

function TabLabel({
  label,
  color,
}: {
  label: string;
  color: ColorValue;
}) {
  return (
    <Text style={{ color, fontSize: 12, fontWeight: "500" }}>{label}</Text>
  );
}

function TabIcon({
  glyph,
  color,
}: {
  glyph: string;
  color: ColorValue;
}) {
  return (
    <Text
      style={{
        color,
        fontSize: 18,
        lineHeight: 24,
        width: 24,
        height: 24,
        textAlign: "center",
      }}
    >
      {glyph}
    </Text>
  );
}

/**
 * stack_tabs — Home · History · Settings (VN labels).
 * frosted_glass nav: glass fill/border; active = accent-ink; inactive = text-muted.
 * Blur omitted (no expo-blur) — glassFill + glass border matches reduced-motion fallback.
 */
export default function TabsLayout() {
  const { isAuthenticated } = useSession();
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.glassFill,
          borderTopColor: colors.glassBorder,
          borderTopWidth: 1,
          height: 56,
          paddingTop: 4,
        },
        tabBarActiveTintColor: colors.accentInk,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarItemStyle: {
          height: 56,
          minHeight: 44,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tabsCopy.home,
          tabBarIcon: ({ color }) => <TabIcon glyph="⌂" color={color} />,
          tabBarLabel: ({ color }) => (
            <TabLabel label={tabsCopy.home} color={color} />
          ),
          tabBarAccessibilityLabel: tabsCopy.home,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: tabsCopy.history,
          tabBarIcon: ({ color }) => <TabIcon glyph="◷" color={color} />,
          tabBarLabel: ({ color }) => (
            <TabLabel label={tabsCopy.history} color={color} />
          ),
          tabBarAccessibilityLabel: tabsCopy.history,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: tabsCopy.settings,
          tabBarIcon: ({ color }) => <TabIcon glyph="⚙" color={color} />,
          tabBarLabel: ({ color }) => (
            <TabLabel label={tabsCopy.settings} color={color} />
          ),
          tabBarAccessibilityLabel: tabsCopy.settings,
        }}
      />
    </Tabs>
  );
}
