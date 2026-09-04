import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AppLogger } from "../../common";
import type { TtsProvider, TtsRequest, TtsResult } from "../interfaces/tts-provider";
import { fetchWithTimeout, providerUnavailable } from "../provider-errors";
import { FakeTtsProvider } from "./fake-tts.provider";
import { VoiceDTO } from "@aura/contracts";

/**
 * Pluggable TTS provider (local preferred; cloud via env).
 *
 * Modes (`TTS_PROVIDER`):
 * - `fake` | `local-silent` → tiny silent WAV under AUDIO_STORAGE_PATH (MVP smoke)
 * - otherwise, if `TTS_BASE_URL` set → POST JSON `{ text, locale, voice? }` and
 *   persist returned audio bytes (assumes `audio/*` body or `{ audioBase64 }`)
 *
 * Assumed cloud API is intentionally thin — document/adjust when a real TTS
 * sidecar lands (devops). Never logs synthesized text.
 */
@Injectable()
export class TtsProviderImpl implements TtsProvider {
  readonly name: string;
  private readonly logger = new AppLogger(TtsProviderImpl.name);
  private readonly silent: FakeTtsProvider;

  constructor(private readonly config: ConfigService) {
    const mode = (this.config.get<string>("TTS_PROVIDER") ?? "local-silent")
      .trim()
      .toLowerCase();
    this.name = mode || "local-silent";
    this.silent = new FakeTtsProvider(config);
  }
  async listVoices(locale: string): Promise<VoiceDTO[]> {
    const normalizedLocale = locale?.trim() || "vi";
    const configured = this.config.get<string>("TTS_VOICES_JSON")?.trim();

    if (configured) {
      try {
        const voices = JSON.parse(configured) as unknown;
        if (Array.isArray(voices)) {
          return voices.filter((voice) => {
            if (!voice || typeof voice !== "object") return false;
            const value = voice as { locale?: string };
            return !value.locale || value.locale === normalizedLocale;
          }) as VoiceDTO[];
        }
      } catch {
        this.logger.warn("tts.listVoices ignored invalid TTS_VOICES_JSON");
      }
    }

    const baseUrl = this.config.get<string>("TTS_BASE_URL")?.trim();
    if (!baseUrl || this.name === "fake" || this.name === "local-silent") {
      return [];
    }

    const timeoutMs = Number(
      this.config.get<string>("TTS_TIMEOUT_MS") ?? 10_000,
    );
    const apiKey = this.config.get<string>("TTS_API_KEY")?.trim();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    try {
      const response = await fetchWithTimeout(
        `${baseUrl.replace(/\/$/, "")}/voices?locale=${encodeURIComponent(normalizedLocale)}`,
        { method: "GET", headers },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10_000,
      );
      if (!response.ok) {
        throw providerUnavailable(`TTS returned HTTP ${response.status}`);
      }

      const payload = (await response.json()) as
        | VoiceDTO[]
        | { voices?: VoiceDTO[] };
      const voices = Array.isArray(payload) ? payload : payload.voices ?? [];
      return voices.filter((voice) => {
        const value = voice as VoiceDTO & { locale?: string };
        return !value.locale || value.locale === normalizedLocale;
      });
    } catch (err) {
      this.logger.warn(`tts.listVoices failed provider=${this.name}`);
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `TTS voices unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  }

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const mode = this.name;
    if (mode === "fake" || mode === "local-silent") {
      const result = await this.silent.synthesize(request);
      return { ...result, providerName: this.name };
    }

    const baseUrl = this.config.get<string>("TTS_BASE_URL")?.trim();
    if (!baseUrl) {
      // Fall back to silent placeholder rather than hard-coding a cloud path.
      this.logger.warn(
        `tts: TTS_BASE_URL unset for provider=${mode}; using silent wav`,
      );
      const result = await this.silent.synthesize(request);
      return { ...result, providerName: `${this.name}-silent-fallback` };
    }

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("TTS_TIMEOUT_MS") ?? 45_000);
    const apiKey = this.config.get<string>("TTS_API_KEY")?.trim();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "audio/wav, audio/mpeg, application/json",
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const url = baseUrl.replace(/\/$/, "");
    const started = Date.now();
    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            text: request.text,
            locale: request.locale ?? "vi",
            voice: request.voice,
          }),
        },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45_000,
      );
    } catch (err) {
      this.logger.warn(
        `tts.synthesize failed provider=${this.name} latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `TTS unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `tts.synthesize http=${response.status} provider=${this.name}`,
      );
      throw providerUnavailable(`TTS returned HTTP ${response.status}`);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    let bytes: Buffer;
    let mimeType = "audio/wav";
    let ext = "wav";

    if (contentType.includes("application/json")) {
      const json = (await response.json()) as { audioBase64?: string; mimeType?: string };
      if (!json.audioBase64) {
        throw providerUnavailable("TTS JSON response missing audioBase64");
      }
      bytes = Buffer.from(json.audioBase64, "base64");
      if (json.mimeType?.includes("mpeg") || json.mimeType?.includes("mp3")) {
        mimeType = "audio/mpeg";
        ext = "mp3";
      }
    } else {
      const ab = await response.arrayBuffer();
      bytes = Buffer.from(ab);
      if (contentType.includes("mpeg") || contentType.includes("mp3")) {
        mimeType = "audio/mpeg";
        ext = "mp3";
      } else if (contentType.includes("mp4") || contentType.includes("m4a")) {
        mimeType = "audio/mp4";
        ext = "m4a";
      } else if (contentType) {
        mimeType = contentType.split(";")[0]!.trim();
      }
    }

    if (!bytes.length) {
      throw providerUnavailable("TTS returned empty audio");
    }

    const root =
      this.config.get<string>("AUDIO_STORAGE_PATH")?.trim() ||
      join(process.cwd(), ".aura-audio");
    const dir = join(root, "_tts");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${randomUUID()}.${ext}`);
    await writeFile(filePath, bytes);

    const latencyMs = Date.now() - started;
    this.logger.log(
      `tts.synthesize ok provider=${this.name} latencyMs=${latencyMs}`,
    );
    return {
      audioUri: filePath,
      providerName: this.name,
      mimeType,
      latencyMs,
    };
  }
}
