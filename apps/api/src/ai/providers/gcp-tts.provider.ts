import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AppLogger } from "../../common";
import type { TtsProvider, TtsRequest, TtsResult } from "../interfaces/tts-provider";
import { fetchWithTimeout, providerUnavailable } from "../provider-errors";
import { getGoogleAccessToken } from "./google-adc";

type SynthesizeResponse = {
  audioContent?: string;
};

/**
 * Cloud Text-to-Speech adapter (`vi-VN` Neural2 default).
 * Env: `GCP_TTS_LANGUAGE_CODE`, `GCP_TTS_VOICE_NAME`, `GCP_TTS_AUDIO_ENCODING`,
 * optional `GCP_TTS_SPEAKING_RATE`, `TTS_TIMEOUT_MS`, `AUDIO_STORAGE_PATH`.
 * Auth: ADC bearer — never logs synthesized text.
 */
@Injectable()
export class GcpTextToSpeechProvider implements TtsProvider {
  readonly name = "gcp-tts";
  private readonly logger = new AppLogger(GcpTextToSpeechProvider.name);

  constructor(private readonly config: ConfigService) {}

  async synthesize(request: TtsRequest): Promise<TtsResult> {
    const languageCode =
      this.config.get<string>("GCP_TTS_LANGUAGE_CODE")?.trim() || "vi-VN";
    const voiceName =
      request.voice?.trim() ||
      this.config.get<string>("GCP_TTS_VOICE_NAME")?.trim() ||
      "vi-VN-Neural2-A";
    const encodingRaw =
      this.config.get<string>("GCP_TTS_AUDIO_ENCODING")?.trim().toUpperCase() ||
      "MP3";
    const audioEncoding =
      encodingRaw === "OGG_OPUS" || encodingRaw === "OGG-OPUS"
        ? "OGG_OPUS"
        : "MP3";
    const speakingRate = Number(
      this.config.get<string>("GCP_TTS_SPEAKING_RATE") ?? 1.0,
    );

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("TTS_TIMEOUT_MS") ?? 45_000);

    const text = request.text?.trim() ?? "";
    if (!text) {
      throw providerUnavailable("GCP TTS received empty text");
    }

    const started = Date.now();
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken();
    } catch (err) {
      this.logger.warn(
        `gcp-tts.synthesize adc failed latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(
        `GCP TTS ADC unavailable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    const body = {
      input: { text },
      voice: {
        languageCode,
        name: voiceName,
      },
      audioConfig: {
        audioEncoding,
        speakingRate:
          Number.isFinite(speakingRate) && speakingRate > 0
            ? speakingRate
            : 1.0,
      },
    };

    let response: Response;
    try {
      response = await fetchWithTimeout(
        "https://texttospeech.googleapis.com/v1/text:synthesize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45_000,
      );
    } catch (err) {
      this.logger.warn(
        `gcp-tts.synthesize failed latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `GCP TTS unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `gcp-tts.synthesize http=${response.status} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(`GCP TTS returned HTTP ${response.status}`);
    }

    const json = (await response.json()) as SynthesizeResponse;
    if (!json.audioContent) {
      throw providerUnavailable("GCP TTS response missing audioContent");
    }

    const bytes = Buffer.from(json.audioContent, "base64");
    if (!bytes.length) {
      throw providerUnavailable("GCP TTS returned empty audio");
    }

    const { mimeType, ext } =
      audioEncoding === "OGG_OPUS"
        ? { mimeType: "audio/ogg", ext: "ogg" }
        : { mimeType: "audio/mpeg", ext: "mp3" };

    const root =
      this.config.get<string>("AUDIO_STORAGE_PATH")?.trim() ||
      join(process.cwd(), ".aura-audio");
    const dir = join(root, "_tts");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${randomUUID()}.${ext}`);
    await writeFile(filePath, bytes);

    const latencyMs = Date.now() - started;
    this.logger.log(`gcp-tts.synthesize ok latencyMs=${latencyMs}`);
    return {
      audioUri: filePath,
      providerName: this.name,
      mimeType,
      latencyMs,
    };
  }
}
