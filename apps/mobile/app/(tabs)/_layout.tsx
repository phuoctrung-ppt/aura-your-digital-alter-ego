import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { tabsCopy } from "../../src/lib/i18n";
import { useSession } from "../../src/lib/session";

// DESIGN-GATE: docs/design/2026-08-17-aura-mobile-mvp.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome

function TabLabel({
  label,
  color,
}: {
  label: string;
  color: ColorValue;
}) {
  return <Text style={{ color, fontSize: 12, fontWeight: "500" }}>{label}</Text>;
}

/**
 * stack_tabs — Home · History · Settings (VN labels).
 */
export default function TabsLayout() {
  const { isAuthenticated } = useSession();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#141C2E",
          borderTopColor: "#243047",
          height: 56,
          paddingTop: 4,
        },
        tabBarActiveTintColor: "#2DD4BF",
        tabBarInactiveTintColor: "#6B7A94",
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
          tabBarLabel: ({ color }) => (
            <TabLabel label={tabsCopy.settings} color={color} />
          ),
          tabBarAccessibilityLabel: tabsCopy.settings,
        }}
      />
    </Tabs>
  );
}
