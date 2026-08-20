import {
  CreateSessionResponseSchema,
  EndSessionResponseSchema,
  GetSessionResponseSchema,
  SessionListResponseSchema,
  type CreateSessionRequest,
  type CreateSessionResponse,
  type EndSessionResponse,
  type GetSessionResponse,
  type Session,
  type SessionListQuery,
  type SessionListResponse,
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

function toQuery(params: SessionListQuery | undefined): string {
  if (!params) return "";
  const search = new URLSearchParams();
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.persona) search.set("persona", params.persona);
  if (params.status) search.set("status", params.status);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Sessions API — create / list / get / end.
 * Paths match docs/contracts/v1-aura.md.
 */
export function createSessionsApi(client: ApiClient = apiClient) {
  return {
    async createSession(
      body: CreateSessionRequest,
    ): Promise<CreateSessionResponse> {
      const raw = await client.request<unknown>("/v1/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return parseOrThrow(CreateSessionResponseSchema, raw, "sessions.create");
    },

    async listSessions(
      query?: SessionListQuery,
    ): Promise<SessionListResponse> {
      const raw = await client.request<unknown>(
        `/v1/sessions${toQuery(query)}`,
        { method: "GET" },
      );
      return parseOrThrow(SessionListResponseSchema, raw, "sessions.list");
    },

    async getSession(sessionId: string): Promise<Session> {
      const raw = await client.request<unknown>(`/v1/sessions/${sessionId}`, {
        method: "GET",
      });
      const envelope: GetSessionResponse = parseOrThrow(
        GetSessionResponseSchema,
        raw,
        "sessions.get",
      );
      return envelope.data;
    },

    async endSession(sessionId: string): Promise<EndSessionResponse> {
      const raw = await client.request<unknown>(
        `/v1/sessions/${sessionId}/end`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      return parseOrThrow(EndSessionResponseSchema, raw, "sessions.end");
    },
  };
}

export const sessionsApi = createSessionsApi();
