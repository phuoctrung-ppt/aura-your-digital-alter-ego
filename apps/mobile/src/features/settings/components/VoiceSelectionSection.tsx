import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  View,
} from "react-native";
import { Audio } from "expo-av";
import { settingsCopy } from "../../../lib/i18n";
import {
  chromeColors,
  useResolvedTheme,
} from "../../../lib/theme";
import { voiceApi } from "../../../lib/api";
import type { VoiceDTO } from "@aura/contracts";

/**
 * Voice Selection Section — Browse, preview, and select TTS voices.
 * DESIGN-GATE: Follows docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * Layout: Segmented rows (minH 52), border-radius 12.
 */
export function VoiceSelectionSection() {
  const { resolved } = useResolvedTheme();
  const colors = chromeColors(resolved);

  const [voices, setVoices] = useState<VoiceDTO[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const loadVoices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await voiceApi.getAvailableVoices();
      setVoices(data);
      // In a real app, we would fetch the current user preference here.
      // For MVP, we'll leave it null or set to first if available.
    } catch (error) {
      Alert.alert("Error", "Could not load available voices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVoices();
  }, [loadVoices]);

  const handlePreview = async (voiceId: string) => {
    if (playingId) return;

    try {
      setPlayingId(voiceId);
      const { data } = await voiceApi.previewVoice(voiceId);

      const { sound } = await Audio.Sound.createAsync({ uri: data.audioUri });
      await sound.playAsync();

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          setPlayingId(null);
        }
      });
    } catch (error) {
      Alert.alert("Error", "Could not play voice preview.");
      setPlayingId(null);
    }
  };

  const handleSelect = async (voiceId: string) => {
    try {
      await voiceApi.updateVoicePreference(voiceId);
      setSelectedId(voiceId);
    } catch (error) {
      Alert.alert("Error", "Could not update voice preference.");
    }
  };

  return (
    <View style={{ marginBottom: 24 }} testID="settings-voice-section">
      <Text
        style={{
          marginBottom: 8,
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {settingsCopy.section_voice || "Giọng nói AI"}
      </Text>

      <Text
        style={{
          marginBottom: 8,
          color: colors.textSecondary,
          fontSize: 13,
          fontWeight: "500",
          lineHeight: 18,
        }}
      >
        {settingsCopy.voice_label || "Chọn giọng nói cho Aura"}
      </Text>

      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.bgElevated,
          overflow: "hidden",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : voices.length === 0 ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              No voices available.
            </Text>
          </View>
        ) : (
          voices.map((voice, index) => {
            const isSelected = selectedId === voice.id;
            return (
              <View
                key={voice.id}
                style={{
                  minHeight: 52,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                  backgroundColor: isSelected ? colors.bgMuted : "transparent",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  <Pressable
                    onPress={() => handlePreview(voice.id)}
                    disabled={!!playingId}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: playingId === voice.id ? colors.accent : colors.border,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Text style={{
                      color: playingId === voice.id ? colors.textOnAccent : colors.text,
                      fontSize: 12,
                      fontWeight: "bold"
                    }}>
                      {playingId === voice.id ? "..." : "▶"}
                    </Text>
                  </Pressable>
                  <View>
                    <Text
                      style={{
                        color: colors.text,
                        fontSize: 16,
                        fontWeight: isSelected ? "600" : "400",
                        lineHeight: 24,
                      }}
                    >
                      {voice.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                      {voice.provider} · {voice.locale}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => handleSelect(voice.id)}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: isSelected ? colors.accent : colors.border,
                    backgroundColor: isSelected ? colors.accent : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isSelected && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: colors.textOnAccent
                      }}
                    />
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
