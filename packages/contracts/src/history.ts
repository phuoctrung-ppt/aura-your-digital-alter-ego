import { z } from "zod";
import { successEnvelopeSchema } from "./envelope.js";

/**
 * DELETE /v1/me/history — hard-delete sessions, turns, memory, safety soft data, audio blobs.
 * Irreversible; client must confirm.
 */
export const DeleteHistoryResponseDataSchema = z.object({
  ok: z.literal(true),
  deletedSessions: z.number().int().nonnegative(),
  deletedTurns: z.number().int().nonnegative(),
  deletedMemoryItems: z.number().int().nonnegative(),
});

export type DeleteHistoryResponseData = z.infer<typeof DeleteHistoryResponseDataSchema>;
export const DeleteHistoryResponseSchema = successEnvelopeSchema(
  DeleteHistoryResponseDataSchema,
);
export type DeleteHistoryResponse = z.infer<typeof DeleteHistoryResponseSchema>;
