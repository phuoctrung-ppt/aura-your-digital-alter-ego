/**
 * Memory DTO surface — Zod schemas from `@aura/contracts` + ZodValidationPipe.
 * Thin re-exports so controllers/services can import from a local barrel if desired.
 */
export {
  MemoryItemSchema,
  MemoryListQuerySchema,
  MemoryListDataSchema,
  MemoryListResponseSchema,
  type MemoryItem,
  type MemoryListQuery,
  type MemoryListData,
  type MemoryListResponse,
} from "@aura/contracts";
