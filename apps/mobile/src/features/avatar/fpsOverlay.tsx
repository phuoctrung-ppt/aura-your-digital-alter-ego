import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * __DEV__ / EXPO_PUBLIC_AVATAR_FPS=1 FPS meter.
 * Production builds ship null / no-op. Mid-Android recipe deferred to QA notes.
 */
export function FpsOverlay() {
  const enabled =
    typeof __DEV__ !== "undefined" &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_AVATAR_FPS === "1";

  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastRef = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    let rafId = 0;
    const tick = () => {
      framesRef.current += 1;
      const now = Date.now();
      const elapsed = now - lastRef.current;
      if (elapsed >= 1000) {
        setFps(Math.round((framesRef.current * 1000) / elapsed));
        framesRef.current = 0;
        lastRef.current = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.text}>{fps} fps</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 8,
    backgroundColor: "rgba(11, 18, 32, 0.75)",
    borderWidth: 1,
    borderColor: "#243047",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    color: "#A8B3C7",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
  },
});
