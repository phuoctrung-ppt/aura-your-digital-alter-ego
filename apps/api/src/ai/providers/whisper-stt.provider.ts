import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { AppLogger } from "../../common";
import type { SttProvider, SttRequest, SttResult } from "../interfaces/stt-provider";
import { fetchWithTimeout, providerUnavailable } from "../provider-errors";

/**
 * Whisper STT adapter (local or hosted via `STT_PROVIDER` / `WHISPER_BASE_URL`).
 *
 * Assumed API shape (OpenAI-compatible Whisper):
 *   POST `{WHISPER_BASE_URL}/v1/audio/transcriptions`
 *   multipart: file=<audio>, model=whisper-1, language=<locale>
 *   response JSON: `{ "text": "..." }`
 *
 * `STT_PROVIDER=whisper-local|whisper-api` is recorded in usage logs; both use
 * the same HTTP path against `WHISPER_BASE_URL` for MVP.
 */
@Injectable()
export class WhisperSttProvider implements SttProvider {
  readonly name: string;
  private readonly logger = new AppLogger(WhisperSttProvider.name);

  constructor(private readonly config: ConfigService) {
    const mode = (this.config.get<string>("STT_PROVIDER") ?? "whisper-local")
      .trim()
      .toLowerCase();
    this.name =
      mode === "whisper-api" || mode === "whisper-local" ? mode : "whisper";
  }

  async transcribe(request: SttRequest): Promise<SttResult> {
    const baseUrl = this.config.get<string>("WHISPER_BASE_URL")?.trim();
    if (!baseUrl) {
      throw providerUnavailable("WHISPER_BASE_URL is not configured");
    }

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("STT_TIMEOUT_MS") ?? 60_000);

    const bytes =
      typeof request.audio === "string"
        ? await readFile(request.audio)
        : request.audio;
    if (!bytes.length) {
      throw providerUnavailable("STT received empty audio buffer");
    }

    const filename =
      typeof request.audio === "string"
        ? basename(request.audio)
        : this.guessFilename(request.mimeType);

    const form = new FormData();
    // Node 22 FormData accepts Blob; wrap Buffer as Uint8Array for typings.
    const blob = new Blob([new Uint8Array(bytes)], {
      type: request.mimeType || "application/octet-stream",
    });
    form.append("file", blob, filename);
    form.append("model", "whisper-1");
    const language = (request.locale ?? "vi").split(/[_-]/)[0] ?? "vi";
    form.append("language", language);

    const url = this.transcriptionsUrl(baseUrl);
    const started = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        { method: "POST", body: form },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
      );
    } catch (err) {
      this.logger.warn(
        `whisper.transcribe failed provider=${this.name} latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `Whisper unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `whisper.transcribe http=${response.status} provider=${this.name} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(`Whisper returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as { text?: string };
    const transcript = body.text?.trim() ?? "";
    if (!transcript) {
      throw providerUnavailable("Whisper returned empty transcript");
    }

    const latencyMs = Date.now() - started;
    this.logger.log(
      `whisper.transcribe ok provider=${this.name} latencyMs=${latencyMs}`,
    );
    return {
      transcript,
      providerName: this.name,
      latencyMs,
    };
  }

  private transcriptionsUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/$/, "");
    if (trimmed.endsWith("/v1/audio/transcriptions")) return trimmed;
    if (trimmed.endsWith("/v1")) return `${trimmed}/audio/transcriptions`;
    return `${trimmed}/v1/audio/transcriptions`;
  }

  private guessFilename(mimeType: string): string {
    const mime = mimeType.toLowerCase();
    if (mime.includes("wav") || mime.includes("wave")) return "audio.wav";
    return "audio.m4a";
  }
}
