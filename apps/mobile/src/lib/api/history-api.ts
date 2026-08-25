import {
  DeleteHistoryResponseSchema,
  type DeleteHistoryResponse,
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

/**
 * History API — hard-delete caller history (M9).
 * Path matches docs/contracts/v1-aura.md `DELETE /v1/me/history`.
 */
export function createHistoryApi(client: ApiClient = apiClient) {
  return {
    async deleteHistory(): Promise<DeleteHistoryResponse> {
      const raw = await client.request<unknown>("/v1/me/history", {
        method: "DELETE",
      });
      return parseOrThrow(
        DeleteHistoryResponseSchema,
        raw,
        "history.delete",
      );
    },
  };
}

export const historyApi = createHistoryApi();
