import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from "@nestjs/common";
import type { ZodTypeAny } from "zod";
import { ErrorCodes } from "@aura/contracts";

/**
 * Validates request payloads with Zod schemas from `@aura/contracts`.
 * Prefer this over class-validator DTOs (contracts are the schema SoT).
 *
 * Usage:
 *   @Body(new ZodValidationPipe(RegisterRequestSchema)) body: RegisterRequest
 *
 * Applied per-parameter (not as a global APP_PIPE) so each route opts into
 * the matching contract schema explicitly.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: "Validation failed",
        details: result.error.flatten(),
      });
    }
    return result.data;
  }
}
