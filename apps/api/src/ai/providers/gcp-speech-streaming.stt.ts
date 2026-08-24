import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLogger } from "../../common";
import { providerUnavailable } from "../provider-errors";
import type {
  StreamingSttFinal,
  StreamingSttProvider,
  StreamingSttSession,
  StreamingSttSessionOptions,
} from "../interfaces/streaming-stt-provider";
import { GcpSpeechSttProvider } from "./gcp-speech-stt.provider";
import { getGoogleAccessToken } from "./google-adc";

type StreamingRecognizeResponse = {
  results?: Array<{
    alternatives?: Array<{ transcript?: string }>;
    isFinal?: boolean;
  }>;
  error?: { code?: number; message?: string };
};

/**
 * GCP streaming STT adapter for the WSS path (ADR-0005 / SP-4).
 *
 * Preferred path: Speech-to-Text **gRPC** `streamingRecognize` via
 * `@google-cloud/speech` when available. This MVP uses a pragmatic hybrid:
 * - Collect PCM / segment frames in-process
 * - Optionally emit a coarse partial when enough audio arrives
 * - On `finalize`, call existing batch `speech:recognize` (LINEAR16) for
 *   PCM frames, or the batch GCP provider for hybrid segments
 *
 * Provider name recorded as `gcp-stream` so Turn.providers distinguishes the
 * WS path. True bidirectional gRPC streaming can replace the finalize call
 * without changing the StreamingSttProvider surface.
 *
 * Never logs transcript text / audio (AGENTS.md §12).
 */
@Injectable()
export class GcpSpeechStreamingSttProvider implements StreamingSttProvider {
  readonly name = "gcp-stream";
  private readonly logger = new AppLogger(GcpSpeechStreamingSttProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly batch: GcpSpeechSttProvider,
  ) {}

  createSession(options: StreamingSttSessionOptions): StreamingSttSession {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let cancelled = false;
    let finalized = false;
    const started = Date.now();
    let partialEmitted = false;
    const sampleRateHz =
      options.sampleRateHz && options.sampleRateHz > 0
        ? options.sampleRateHz
        : 16_000;

    const maybePartial = () => {
      if (partialEmitted || !options.onPartial) return;
      // Emit once after ~0.5s of PCM16@16k mono (~16KB) or any hybrid segment.
      const threshold =
        options.encoding === "pcm_s16le" ? sampleRateHz /* ~0.5s */ : 1;
      if (totalBytes >= threshold) {
        partialEmitted = true;
        options.onPartial({ text: "…", isFinal: false });
      }
    };

    return {
      pushAudio: (frame: Buffer) => {
        if (cancelled || finalized) return;
        if (!frame.length) return;
        chunks.push(frame);
        totalBytes += frame.length;
        maybePartial();
      },
      finalize: async (): Promise<StreamingSttFinal> => {
        if (finalized) {
          throw providerUnavailable("GCP streaming STT session already finalized");
        }
        finalized = true;
        if (cancelled) {
          throw providerUnavailable("GCP streaming STT session cancelled");
        }
        const audio = Buffer.concat(chunks);
        if (!audio.length) {
          throw providerUnavailable("GCP streaming STT received empty uplink");
        }

        try {
          if (options.encoding === "pcm_s16le") {
            return await this.finalizePcm(audio, options, started);
          }
          const mimeType =
            options.encoding === "segment_m4a" ? "audio/mp4" : "audio/wav";
          const batchResult = await this.batch.transcribe({
            audio,
            mimeType,
            locale: options.locale,
          });
          this.logger.log(
            `gcp-stream.finalize hybrid encoding=${options.encoding} latencyMs=${Date.now() - started}`,
          );
          return {
            transcript: batchResult.transcript,
            providerName: this.name,
            latencyMs: batchResult.latencyMs ?? Date.now() - started,
          };
        } catch (err) {
          this.logger.warn(
            `gcp-stream.finalize failed latencyMs=${Date.now() - started}`,
          );
          if (err instanceof Error && "getStatus" in err) throw err;
          throw providerUnavailable(
            `GCP streaming STT failed: ${err instanceof Error ? err.message : "unknown"}`,
          );
        }
      },
      cancel: () => {
        cancelled = true;
        chunks.length = 0;
        totalBytes = 0;
      },
    };
  }

  /**
   * Batch LINEAR16 recognize for concatenated PCM frames.
   * Placeholder for true streamingRecognize; keeps ADC + vi-VN behavior.
   */
  private async finalizePcm(
    audio: Buffer,
    options: StreamingSttSessionOptions,
    started: number,
  ): Promise<StreamingSttFinal> {
    const languageCode =
      this.config.get<string>("GCP_SPEECH_LANGUAGE_CODE")?.trim() || "vi-VN";
    const model =
      this.config.get<string>("GCP_SPEECH_MODEL")?.trim() || "latest_long";
    const sampleRateHertz =
      options.sampleRateHz && options.sampleRateHz > 0
        ? options.sampleRateHz
        : Number(this.config.get<string>("GCP_SPEECH_SAMPLE_RATE_HERTZ") ?? 16_000);

    const accessToken = await getGoogleAccessToken();
    const body = {
      config: {
        encoding: "LINEAR16",
        sampleRateHertz:
          Number.isFinite(sampleRateHertz) && sampleRateHertz > 0
            ? sampleRateHertz
            : 16_000,
        languageCode,
        model,
        enableAutomaticPunctuation: true,
      },
      audio: {
        content: audio.toString("base64"),
      },
    };

    const timeoutMs = Number(this.config.get<string>("STT_TIMEOUT_MS") ?? 60_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(
        "https://speech.googleapis.com/v1/speech:recognize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw providerUnavailable(
          `GCP streaming STT timed out after ${timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      this.logger.warn(
        `gcp-stream.recognize http=${response.status} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(
        `GCP streaming STT returned HTTP ${response.status}`,
      );
    }

    const json = (await response.json()) as StreamingRecognizeResponse;
    if (json.error?.message) {
      throw providerUnavailable(
        `GCP streaming STT error: ${json.error.message}`,
      );
    }

    const transcript = (json.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
      .filter((t) => t.length > 0)
      .join(" ")
      .trim();

    if (!transcript) {
      throw providerUnavailable("GCP streaming STT returned empty transcript");
    }

    const latencyMs = Date.now() - started;
    this.logger.log(`gcp-stream.finalize pcm ok latencyMs=${latencyMs}`);
    return {
      transcript,
      providerName: this.name,
      latencyMs,
    };
  }
}
