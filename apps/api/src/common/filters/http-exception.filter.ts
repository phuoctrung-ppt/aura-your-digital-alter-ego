import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { ErrorCodes, fail } from "@aura/contracts";

/**
 * Maps Nest/HTTP exceptions → AGENTS.md §15 envelope
 * `{ data: null, error: { code, message, details? } }`.
 * Preserves `details` when present (e.g. Zod validation flatten).
 *
 * Unexpected (non-HttpException) errors are logged without request bodies
 * or auth headers — never dump secrets/PII into logs.
 */
@Catch()
export class HttpEnvelopeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpEnvelopeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ method?: string; url?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCodes.INTERNAL_ERROR;
    let message = "Internal server error";
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === "string") {
        message = body;
        code = statusToDefaultCode(status);
      } else if (body && typeof body === "object") {
        const record = body as Record<string, unknown>;
        if (typeof record.message === "string") {
          message = record.message;
        } else if (Array.isArray(record.message)) {
          // Nest ValidationPipe-style message arrays
          message = record.message.join("; ");
        }
        if (typeof record.code === "string") {
          code = record.code;
        } else {
          code = statusToDefaultCode(status);
        }
        if ("details" in record) {
          details = record.details;
        }
      } else {
        code = statusToDefaultCode(status);
      }
    } else {
      const method = request?.method ?? "?";
      const url = request?.url ?? "?";
      const errMessage =
        exception instanceof Error ? exception.message : "Unknown error";
      // Stack only — no headers/body (may contain Authorization / passwords).
      this.logger.error(
        `Unhandled ${method} ${url}: ${errMessage}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json(fail(code, message, details));
  }
}

function statusToDefaultCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return ErrorCodes.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ErrorCodes.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ErrorCodes.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ErrorCodes.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ErrorCodes.RATE_LIMITED;
    case HttpStatus.BAD_REQUEST:
      return ErrorCodes.VALIDATION_ERROR;
    case HttpStatus.NOT_IMPLEMENTED:
      return ErrorCodes.INTERNAL_ERROR;
    default:
      return ErrorCodes.INTERNAL_ERROR;
  }
}
