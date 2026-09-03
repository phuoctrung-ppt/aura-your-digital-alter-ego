import { Text, View } from "react-native";
import { sessionCopy } from "../../../lib/i18n";
import { stageColors } from "../../../lib/theme";

// DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
// DESIGN-GATE: asset-pack N/A — product chrome
// DESIGN-GATE: caption strip h=84 · radius 16 · padding 16 · optional_default_on_assistant

type SessionCaptionProps = {
  text: string;
  visible: boolean;
};

/**
 * Live caption strip under safety / above waveform.
 * Label = mono pill (accentMuted + accent + letterSpacing) like CallScreen chip.
 * Renders null when hidden or empty so stage reclaim has no dead space.
 */
export function SessionCaption({ text, visible }: SessionCaptionProps) {
  const trimmed = text.trim();
  if (!visible || !trimmed) {
    return null;
  }

  return (
    <View
      accessibilityLabel={`${sessionCopy.caption.label}: ${trimmed}`}
      style={{
        height: 84,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        backgroundColor: stageColors.captionFill,
        borderWidth: 1,
        borderColor: stageColors.captionBorder,
        justifyContent: "center",
      }}
    >
      <View
        style={{
          alignSelf: "flex-start",
          marginBottom: 6,
          borderRadius: 6,
          backgroundColor: stageColors.accentMuted,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Text
          style={{
            color: stageColors.accent,
            fontSize: 11,
            fontWeight: "600",
            letterSpacing: 1,
            lineHeight: 16,
          }}
        >
          {sessionCopy.caption.label}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={{
          color: stageColors.text,
          fontSize: 16,
          fontWeight: "400",
          lineHeight: 24,
        }}
      >
        {trimmed}
      </Text>
    </View>
  );
}
