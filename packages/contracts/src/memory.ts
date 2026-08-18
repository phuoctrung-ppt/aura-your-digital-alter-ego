import { z } from "zod";
import {
  CursorPageMetaSchema,
  CursorPaginationQuerySchema,
  IsoDateTimeSchema,
  PersonaSlugSchema,
  UuidSchema,
} from "./common.js";
import { successEnvelopeSchema } from "./envelope.js";

/**
 * Memory fact used by orchestrator; optional list for settings/debug.
 * Not a full RAG surface in MVP.
 */
export const MemoryItemSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  personaSlug: PersonaSlugSchema.nullable(),
  fact: z.string().min(1),
  sourceTurnId: UuidSchema.nullable(),
  salience: z.number().min(0).max(1).optional(),
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
});

export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const MemoryListQuerySchema = CursorPaginationQuerySchema.extend({
  persona: PersonaSlugSchema.optional(),
  activeOnly: z.coerce.boolean().optional().default(true),
});

export type MemoryListQuery = z.infer<typeof MemoryListQuerySchema>;

export const MemoryListDataSchema = CursorPageMetaSchema.extend({
  items: z.array(MemoryItemSchema),
});

export type MemoryListData = z.infer<typeof MemoryListDataSchema>;
export const MemoryListResponseSchema = successEnvelopeSchema(MemoryListDataSchema);
export type MemoryListResponse = z.infer<typeof MemoryListResponseSchema>;
