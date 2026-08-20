import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "node:fs/promises";
import { AppLogger } from "../../common";
import type { SttProvider, SttRequest, SttResult } from "../interfaces/stt-provider";
import { fetchWithTimeout, providerUnavailable } from "../provider-errors";
import { getGoogleAccessToken } from "./google-adc";

type SpeechRecognizeResponse = {
  results?: Array<{
    alternatives?: Array<{ transcript?: string }>;
  }>;
};

/**
 * Cloud Speech-to-Text adapter (`vi-VN` default).
 * Env: `GCP_SPEECH_LANGUAGE_CODE`, `GCP_SPEECH_MODEL`, `GCP_SPEECH_ENCODING`,
 * `GCP_SPEECH_SAMPLE_RATE_HERTZ`, `STT_TIMEOUT_MS`.
 * Auth: ADC bearer — never logs transcript text.
 */
@Injectable()
export class GcpSpeechSttProvider implements SttProvider {
  readonly name = "gcp-speech";
  private readonly logger = new AppLogger(GcpSpeechSttProvider.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(request: SttRequest): Promise<SttResult> {
    const languageCode =
      this.config.get<string>("GCP_SPEECH_LANGUAGE_CODE")?.trim() || "vi-VN";
    const model =
      this.config.get<string>("GCP_SPEECH_MODEL")?.trim() || "latest_long";
    const sampleRateHertz = Number(
      this.config.get<string>("GCP_SPEECH_SAMPLE_RATE_HERTZ") ?? 16_000,
    );
    const encodingOverride = this.config
      .get<string>("GCP_SPEECH_ENCODING")
      ?.trim()
      .toUpperCase();
    const encoding =
      encodingOverride && encodingOverride.length > 0
        ? encodingOverride
        : this.encodingFromMime(request.mimeType);

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("STT_TIMEOUT_MS") ?? 60_000);

    const bytes =
      typeof request.audio === "string"
        ? await readFile(request.audio)
        : request.audio;
    if (!bytes.length) {
      throw providerUnavailable("GCP Speech received empty audio buffer");
    }

    const started = Date.now();
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken();
    } catch (err) {
      this.logger.warn(
        `gcp-speech.transcribe adc failed latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(
        `GCP Speech ADC unavailable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    const body = {
      config: {
        encoding,
        sampleRateHertz:
          Number.isFinite(sampleRateHertz) && sampleRateHertz > 0
            ? sampleRateHertz
            : 16_000,
        languageCode,
        model,
        enableAutomaticPunctuation: true,
      },
      audio: {
        content: bytes.toString("base64"),
      },
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        "https://speech.googleapis.com/v1/speech:recognize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
      );
    } catch (err) {
      this.logger.warn(
        `gcp-speech.transcribe failed latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `GCP Speech unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `gcp-speech.transcribe http=${response.status} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(`GCP Speech returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as SpeechRecognizeResponse;
    const transcript = (json.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
      .filter((t) => t.length > 0)
      .join(" ")
      .trim();

    if (!transcript) {
      throw providerUnavailable("GCP Speech returned empty transcript");
    }

    const latencyMs = Date.now() - started;
    this.logger.log(`gcp-speech.transcribe ok latencyMs=${latencyMs}`);
    return {
      transcript,
      providerName: this.name,
      latencyMs,
    };
  }

  private encodingFromMime(mimeType: string): string {
    const mime = (mimeType || "").toLowerCase();
    if (mime.includes("wav") || mime.includes("wave") || mime.includes("pcm")) {
      return "LINEAR16";
    }
    if (mime.includes("webm")) return "WEBM_OPUS";
    if (mime.includes("ogg") || mime.includes("opus")) return "OGG_OPUS";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "MP3";
    if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
      // Speech v1 supports MP3 / WEBM_OPUS widely; MP4 is spotty — prefer WEBM_OPUS fallback.
      return "MP3";
    }
    const configured = this.config
      .get<string>("GCP_SPEECH_ENCODING")
      ?.trim()
      .toUpperCase();
    return configured && configured.length > 0 ? configured : "LINEAR16";
  }
}
