import { ConsoleLogger, Injectable, LogLevel, Scope } from "@nestjs/common";

/**
 * Nest ConsoleLogger wrapper for API services.
 *
 * Never log: passwords, tokens, API keys, password hashes, emails,
 * raw transcripts, or audio payloads (AGENTS.md §6 / §12).
 *
 * Prefer structured fields: requestId, userId, sessionId, provider, latencyMs.
 *
 * Usage (manual):
 *   private readonly logger = new AppLogger(MyService.name);
 *
 * Or inject as a TRANSIENT provider and call `setContext(MyService.name)`.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  /**
   * Restrict active levels (e.g. production: `['log', 'warn', 'error']`).
   * Call early in bootstrap when tightening verbosity.
   */
  setSafeLogLevels(levels: LogLevel[]): void {
    this.setLogLevels(levels);
  }
}
