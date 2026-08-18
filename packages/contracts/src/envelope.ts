import { z } from "zod";
import { ErrorCodeSchema } from "./error-codes.js";

/** Error object inside the response envelope. */
export const ErrorObjectSchema = z.object({
  code: ErrorCodeSchema.or(z.string().min(1)),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

export type ErrorObject = z.infer<typeof ErrorObjectSchema>;

/**
 * Success envelope: `{ data: T, error: null }`.
 * Matches `apps/api` health controller and AGENTS.md §15.
 */
export function successEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
    error: z.null(),
  });
}

/** Error envelope: `{ data: null, error: ErrorObject }`. */
export const ErrorEnvelopeSchema = z.object({
  data: z.null(),
  error: ErrorObjectSchema,
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

/**
 * Union envelope for a given success payload schema.
 * Prefer `successEnvelopeSchema` + `ErrorEnvelopeSchema` at call sites when needed.
 */
export function apiEnvelopeSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.union([successEnvelopeSchema(dataSchema), ErrorEnvelopeSchema]);
}

export type SuccessEnvelope<T> = { data: T; error: null };
export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

/** Runtime helper — build success body (no Zod parse). */
export function ok<T>(data: T): SuccessEnvelope<T> {
  return { data, error: null };
}

/** Runtime helper — build error body. */
export function fail(
  code: string,
  message: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    data: null,
    error:
      details === undefined
        ? { code, message }
        : { code, message, details },
  };
}
