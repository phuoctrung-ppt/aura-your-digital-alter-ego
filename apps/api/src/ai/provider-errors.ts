import {
  BadRequestException,
  GatewayTimeoutException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ErrorCodes } from "@aura/contracts";

/** Thrown by providers / orchestrator when upstream AI is down or misconfigured. */
export function providerUnavailable(
  message = "AI provider unavailable",
): ServiceUnavailableException {
  return new ServiceUnavailableException({
    code: ErrorCodes.PROVIDER_UNAVAILABLE,
    message,
  });
}

/**
 * Audio was accepted on the wire but produced no usable speech transcript
 * (silence / too short / no speech detected). Prefer this over
 * PROVIDER_UNAVAILABLE so clients do not treat silence as "provider down".
 */
export function audioInvalid(
  message = "Audio produced no speech transcript",
): BadRequestException {
  return new BadRequestException({
    code: ErrorCodes.AUDIO_INVALID,
    message,
  });
}

/** Orchestration wall-clock exceeded TURN_REQUEST_TIMEOUT_MS. */
export function turnTimeout(
  message = "Turn orchestration timed out",
): GatewayTimeoutException {
  return new GatewayTimeoutException({
    code: ErrorCodes.TURN_TIMEOUT,
    message,
  });
}

/**
 * Race a promise against a timeout. AbortSignal is forwarded when the caller
 * supplies one; otherwise we only reject the race (provider may keep running).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error = () => turnTimeout(),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fetch helper with AbortSignal timeout. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw providerUnavailable(`Provider request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
