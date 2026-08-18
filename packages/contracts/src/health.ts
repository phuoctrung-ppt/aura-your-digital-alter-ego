import { z } from "zod";
import { successEnvelopeSchema } from "./envelope.js";

/** Public `GET /health` (and root) — non-/v1, matches HealthController. */
export const HealthDataSchema = z.object({
  ok: z.literal(true),
  service: z.literal("aura-api"),
});

export type HealthData = z.infer<typeof HealthDataSchema>;
export const HealthResponseSchema = successEnvelopeSchema(HealthDataSchema);
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
