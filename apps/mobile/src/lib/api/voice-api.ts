import { apiClient } from "./client";
import type { VoiceDTO } from "@aura/contracts";

export const voiceApi = {
  /**
   * Fetches the list of available TTS voices.
   * GET /v1/me/voices
   */
  async getAvailableVoices(): Promise<VoiceDTO[]> {
    const response = await apiClient.request<{ data: VoiceDTO[] }>(
      "/v1/me/voices",
      { method: "GET" },
    );
    return response.data;
  },

  /**
   * Requests a short audio preview for a specific voice.
   * POST /v1/me/voices/preview
   */
  async previewVoice(voiceId: string): Promise<{ data: { audioUri: string } }> {
    return apiClient.request<{ data: { audioUri: string } }>(
      "/v1/me/voices/preview",
      {
        method: "POST",
        body: JSON.stringify({ voiceId }),
      },
    );
  },

  /**
   * Updates the user's preferred AI voice.
   * PATCH /v1/me/voices/preference
   */
  async updateVoicePreference(voiceId: string): Promise<{ data: { success: boolean } }> {
    return apiClient.request<{ data: { success: boolean } }>(
      "/v1/me/voices/preference",
      {
        method: "PATCH",
        body: JSON.stringify({ voiceId }),
      },
    );
  },
};
