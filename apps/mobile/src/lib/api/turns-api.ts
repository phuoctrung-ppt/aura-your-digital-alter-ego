import {
  TurnResponseSchema,
  type CreateTurnFormFields,
  type TurnResponse,
} from "@aura/contracts";
import { apiClient, ApiError, type ApiClient } from "./client";

function parseOrThrow<T>(
  schema: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
  raw: unknown,
  label: string,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      "INTERNAL_ERROR",
      `Invalid ${label} response shape`,
      500,
    );
  }
  return parsed.data;
}

export type UploadTurnInput = CreateTurnFormFields & {
  /**
   * Local audio URI from expo-audio recording.
   * Field name on the wire MUST be `audio` (SP-3).
   */
  audioUri: string;
  /** MIME for the file part; default audio/m4a. */
  mimeType?: string;
  fileName?: string;
};

/**
 * Voice turns API — `POST /v1/sessions/:id/turns` multipart.
 *
 * Scaffold: builds FormData with field `audio`. Frontend-worker wires
 * real expo-audio recording + playback; do not call until PTT is implemented.
 */
export function createTurnsApi(client: ApiClient = apiClient) {
  return {
    async uploadTurn(
      sessionId: string,
      input: UploadTurnInput,
    ): Promise<TurnResponse> {
      // TODO(frontend-worker M7): attach real recorded blob from expo-audio.
      const form = new FormData();
      form.append("audio", {
        uri: input.audioUri,
        name: input.fileName ?? "turn.m4a",
        type: input.mimeType ?? "audio/m4a",
      } as unknown as Blob);

      if (input.clientDurationMs !== undefined) {
        form.append("clientDurationMs", String(input.clientDurationMs));
      }
      if (input.clientLocale) {
        form.append("clientLocale", input.clientLocale);
      }
      if (input.clientTurnId) {
        form.append("clientTurnId", input.clientTurnId);
      }

      const raw = await client.request<unknown>(
        `/v1/sessions/${sessionId}/turns`,
        {
          method: "POST",
          body: form,
        },
      );
      return parseOrThrow(TurnResponseSchema, raw, "turns.upload");
    },
  };
}

export const turnsApi = createTurnsApi();
