import "./global.css";

import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";

/**
 * M0/M6 mobile stub — NativeWind smoke only.
 * Full navigation / auth / PTT / avatar land in M7+ (DESIGN-GATE on
 * docs/design/2026-08-17-aura-mobile-mvp.spec.md).
 * EXPO_PUBLIC_API_URL is reserved for API base (see AGENTS.md §13).
 */
export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-app px-6">
      <Text className="mb-2 text-display text-ink">Aura</Text>
      <Text className="text-center text-body text-ink-secondary">
        Sẵn sàng luyện nói
      </Text>
      <StatusBar style="light" />
    </View>
  );
}
