import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { readFile } from "node:fs/promises";
import { AppLogger } from "../../common";
import type {
  SttProvider,
  SttRequest,
  SttResult,
} from "../interfaces/stt-provider";
import {
  audioInvalid,
  fetchWithTimeout,
  providerUnavailable,
} from "../provider-errors";
import {
  inputFormatFromMime,
  mimeNeedsLinear16Transcode,
  transcodeToLinear16,
} from "./audio-to-linear16";
import {
  resolveSpeechAlternativeLanguageCodes,
  resolveSpeechLanguageCode,
} from "./gcp-speech-language";
import { getGoogleAuthHeaders } from "./google-adc";

type SpeechRecognizeResponse = {
  results?: Array<{
    alternatives?: Array<{ transcript?: string }>;
  }>;
  error?: { code?: number; message?: string };
};

/**
 * Cloud Speech-to-Text adapter (`vi-VN` default).
 * Env: `GCP_SPEECH_LANGUAGE_CODE`, `GCP_SPEECH_MODEL`, `GCP_SPEECH_ENCODING`,
 * `GCP_SPEECH_SAMPLE_RATE_HERTZ`, `STT_TIMEOUT_MS`, optional `FFMPEG_PATH`.
 * Auth: ADC bearer + quota project header — never logs transcript text.
 *
 * Speech v1 does not accept AAC/M4A/MP4. Expo HIGH_QUALITY uplink is m4a/AAC
 * (SP-3/SP-4), so those payloads are decoded to mono LINEAR16 via ffmpeg
 * before `speech:recognize`.
 */
@Injectable()
export class GcpSpeechSttProvider implements SttProvider {
  readonly name = "gcp-speech";
  private readonly logger = new AppLogger(GcpSpeechSttProvider.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(request: SttRequest): Promise<SttResult> {
    const languageCode = resolveSpeechLanguageCode(
      request.locale,
      this.config.get<string>("GCP_SPEECH_LANGUAGE_CODE"),
    );
    const model =
      this.config.get<string>("GCP_SPEECH_MODEL")?.trim() || "latest_long";
    const configuredRate = Number(
      this.config.get<string>("GCP_SPEECH_SAMPLE_RATE_HERTZ") ?? 16_000,
    );
    const defaultSampleRate =
      Number.isFinite(configuredRate) && configuredRate > 0
        ? configuredRate
        : 16_000;
    const encodingOverride = this.config
      .get<string>("GCP_SPEECH_ENCODING")
      ?.trim()
      .toUpperCase();

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("STT_TIMEOUT_MS") ?? 60_000);

    const bytes =
      typeof request.audio === "string"
        ? await readFile(request.audio)
        : request.audio;
    if (!bytes.length) {
      throw audioInvalid("GCP Speech received empty audio buffer");
    }

    const started = Date.now();
    let authHeaders: Record<string, string>;
    try {
      authHeaders = await getGoogleAuthHeaders();
    } catch (err) {
      this.logger.warn(
        `gcp-speech.transcribe adc failed latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(
        `GCP Speech ADC unavailable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    let encoding: string;
    let sampleRateHertz: number | undefined;
    let contentBytes = bytes;

    // Always decode unsupported containers (m4a/AAC/…) — do not honor
    // GCP_SPEECH_ENCODING=MP3 for AAC payloads (Speech v1 ≠ AAC).
    const forceTranscode = mimeNeedsLinear16Transcode(request.mimeType);

    if (forceTranscode) {
      try {
        const linear = await transcodeToLinear16(bytes, {
          sampleRateHz: defaultSampleRate,
          inputFormat: inputFormatFromMime(request.mimeType),
          normalize: true,
        });
        contentBytes = linear.pcm;
        encoding = "LINEAR16";
        sampleRateHertz = linear.sampleRateHz;
        this.logger.log(
          `gcp-speech.transcode mime=${sanitizeMime(request.mimeType)} pcmBytes=${contentBytes.length} sampleRateHz=${sampleRateHertz}`,
        );
      } catch (err) {
        this.logger.warn(
          `gcp-speech.transcode failed latencyMs=${Date.now() - started}`,
        );
        throw providerUnavailable(
          `GCP Speech audio decode failed: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    } else {
      encoding =
        encodingOverride && encodingOverride.length > 0
          ? encodingOverride
          : this.encodingFromMime(request.mimeType);
      // LINEAR16 / MULAW / etc need an explicit rate; FLAC/WAV containers can omit.
      if (
        encoding === "LINEAR16" ||
        encoding === "MULAW" ||
        encoding === "ALAW"
      ) {
        sampleRateHertz = defaultSampleRate;
      }
    }

    if (!contentBytes.length) {
      throw audioInvalid("GCP Speech audio decode produced empty PCM");
    }

    const alternativeLanguageCodes =
      resolveSpeechAlternativeLanguageCodes(languageCode);
    const config: Record<string, unknown> = {
      encoding,
      languageCode,
      alternativeLanguageCodes,
      model,
      enableAutomaticPunctuation: true,
    };
    if (sampleRateHertz !== undefined) {
      config.sampleRateHertz = sampleRateHertz;
    }

    const body = {
      config,
      audio: {
        content: contentBytes.toString("base64"),
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
            ...authHeaders,
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
    if (json.error?.message) {
      throw providerUnavailable(`GCP Speech error: ${json.error.message}`);
    }

    const transcript = (json.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
      .filter((t) => t.length > 0)
      .join(" ")
      .trim();

    if (!transcript) {
      // Speech accepted the request but found no speech — not a provider outage.
      throw audioInvalid("GCP Speech returned empty transcript");
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
    if (mime.includes("flac")) return "FLAC";
    if (mime.includes("webm")) return "WEBM_OPUS";
    if (mime.includes("ogg") || mime.includes("opus")) return "OGG_OPUS";
    // Never map m4a/AAC → MP3: Speech v1 rejects AAC/MP4 and beta MP3 ≠ AAC.
    // Callers should hit the ffmpeg LINEAR16 path via mimeNeedsLinear16Transcode.
    const configured = this.config
      .get<string>("GCP_SPEECH_ENCODING")
      ?.trim()
      .toUpperCase();
    return configured && configured.length > 0 ? configured : "LINEAR16";
  }
}

function sanitizeMime(mimeType: string): string {
  return (mimeType || "unknown").toLowerCase().slice(0, 40);
}
