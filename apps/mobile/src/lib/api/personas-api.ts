import {
  PersonaListResponseSchema,
  type Persona,
  type PersonaListResponse,
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
 * Personas catalog API — `GET /v1/personas`.
 * MVP catalog is exactly 2 items (contract-enforced).
 */
export function createPersonasApi(client: ApiClient = apiClient) {
  return {
    async listPersonas(): Promise<Persona[]> {
      const raw = await client.request<unknown>("/v1/personas", {
        method: "GET",
      });
      const envelope: PersonaListResponse = parseOrThrow(
        PersonaListResponseSchema,
        raw,
        "personas.list",
      );
      return envelope.data.items;
    },
  };
}

export const personasApi = createPersonasApi();
