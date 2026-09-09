/**
 * Supertest + AGENTS.md §15 envelope assert helpers (M12).
 *
 * Envelope shape: `{ data: T, error: null }` | `{ data: null, error: { code, message, details? } }`
 * Prefer `@aura/contracts` schemas when asserting.
 *
 * Never dump full bodies that may contain transcripts / crisis text.
 */

export type EnvelopeSuccess<T> = { data: T; error: null };
export type EnvelopeError = {
  data: null;
  error: { code: string; message: string; details?: unknown };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Assert HTTP JSON is a success envelope; return `data`. */
export function expectOkEnvelope<T = unknown>(body: unknown): T {
  expect(isRecord(body)).toBe(true);
  const record = body as Record<string, unknown>;
  expect(record.error).toBeNull();
  expect(record.data).toBeDefined();
  return record.data as T;
}

/** Assert HTTP JSON is an error envelope with the given code. */
export function expectErrorEnvelope(
  body: unknown,
  code: string,
): EnvelopeError["error"] {
  expect(isRecord(body)).toBe(true);
  const record = body as Record<string, unknown>;
  expect(record.data).toBeNull();
  expect(isRecord(record.error)).toBe(true);
  const error = record.error as EnvelopeError["error"];
  expect(error.code).toBe(code);
  expect(typeof error.message).toBe("string");
  return error;
}
