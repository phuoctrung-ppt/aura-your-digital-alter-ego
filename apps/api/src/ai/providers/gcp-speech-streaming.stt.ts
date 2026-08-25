import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SpeechClient } from "@google-cloud/speech";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AppLogger } from "../../common";
import { audioInvalid, providerUnavailable } from "../provider-errors";
import type {
  StreamingSttFinal,
  StreamingSttProvider,
  StreamingSttSession,
  StreamingSttSessionOptions,
} from "../interfaces/streaming-stt-provider";
import {
  hasMp4MoovAtom,
  isWebmEbml,
  resolveEffectiveInputFormat,
  transcodeToLinear16,
} from "./audio-to-linear16";
import {
  resolveHybridSpeechModels,
  resolveSpeechAlternativeLanguageCodes,
  resolveSpeechLanguageCode,
} from "./gcp-speech-language";
import { resolveGoogleQuotaProject } from "./google-adc";

type StreamingRecognizeResponse = {
  results?: Array<{
    alternatives?: Array<{ transcript?: string | null } | null> | null;
    isFinal?: boolean | null;
  } | null> | null;
  error?: { code?: number | null; message?: string | null } | null;
};

/** Keep each gRPC audio message under Speech's ~25 KiB frame guidance. */
const STREAM_WRITE_CHUNK_BYTES = 24 * 1024;

/**
 * Realtime pacing for pre-buffered PCM on the streaming API.
 * Burst-writing a whole utterance makes Speech return zero hypotheses.
 */
const STREAM_REALTIME_CHUNK_MS = 100;

/** Sync Speech `recognize` hard limit is ~60s; reject / truncate above this. */
const SYNC_RECOGNIZE_MAX_DURATION_MS = 60_000;
/** Safe window kept when a single demuxed segment somehow exceeds the limit. */
const SYNC_RECOGNIZE_SAFE_DURATION_MS = 55_000;

/**
 * GCP streaming STT adapter for the WSS path (ADR-0005 / SP-4).
 *
 * Provider name `gcp-stream` distinguishes the WS path from batch `gcp-speech`.
 *
 * Path selection:
 * - `pcm_s16le` (live frames): gRPC **`streamingRecognize`**, writing as frames
 *   arrive (already near-realtime from the client).
 * - `segment_m4a` / `segment_wav`: buffer frames until finalize, then rebuild
 *   container bytes. Mobile may send **one complete m4a** split across several
 *   ≤64 KiB frames (same file, chunked) — those are concatenated first. Expo
 *   **web** still declares `segment_m4a` but MediaRecorder emits **WebM**
 *   (EBML; no `moov`) — sniff and ffmpeg-decode as webm. Legacy multi-clip
 *   hybrid (each frame its own complete container) still works: decode + sync
 *   `recognize` **per container**, join texts. Never concat all decoded PCM
 *   into one >60s sync call. Do **not** dump a finished file into
 *   `streamingRecognize` — burst uploads yield empty results. Incomplete m4a
 *   (no moov, not WebM) are skipped — Speech v1 has no AAC/M4A passthrough.
 *
 * Never logs transcript text / audio (AGENTS.md §12).
 */
@Injectable()
export class GcpSpeechStreamingSttProvider implements StreamingSttProvider {
  readonly name = "gcp-stream";
  private readonly logger = new AppLogger(GcpSpeechStreamingSttProvider.name);
  private client: SpeechClient | undefined;

  constructor(private readonly config: ConfigService) {}

  createSession(options: StreamingSttSessionOptions): StreamingSttSession {
    const sampleRateHz = resolveSampleRateHz(options, this.config);
    const languageCode = resolveSpeechLanguageCode(
      options.locale,
      this.config.get<string>("GCP_SPEECH_LANGUAGE_CODE"),
    );
    // Hybrid PTT clips are short. Prefer latest_short even if env still has
    // latest_long (SP-2 batch default) — empty results were seen with long model
    // on quiet Expo segments. Env can force with GCP_SPEECH_STREAM_MODEL.
    const model =
      this.config.get<string>("GCP_SPEECH_STREAM_MODEL")?.trim() ||
      "latest_short";

    const pcmChunks: Buffer[] = [];
    const containerSegments: Buffer[] = [];
    let totalBytes = 0;
    let cancelled = false;
    let finalized = false;
    const started = Date.now();

    // Live PCM path — stream opened lazily on first push.
    let recognizeStream: NodeJS.WritableStream | undefined;
    let streamResultPromise: Promise<CollectedTranscript> | undefined;
    let streamStarted = false;

    const ensureLivePcmStream = () => {
      if (streamStarted || cancelled || finalized) return;
      if (options.encoding !== "pcm_s16le") return;
      streamStarted = true;
      const opened = this.openStreamingRecognize({
        sampleRateHz,
        languageCode,
        model,
        onPartial: options.onPartial,
      });
      recognizeStream = opened.stream;
      streamResultPromise = opened.result;
      this.logger.log(
        `gcp-stream.open encoding=pcm_s16le language=${languageCode} model=${model} sampleRateHz=${sampleRateHz}`,
      );
    };

    return {
      pushAudio: (frame: Buffer) => {
        if (cancelled || finalized) return;
        if (!frame.length) return;
        totalBytes += frame.length;

        if (options.encoding === "pcm_s16le") {
          pcmChunks.push(frame);
          ensureLivePcmStream();
          if (recognizeStream) {
            writePcmInChunks(recognizeStream, frame);
          }
          return;
        }

        // Hybrid: buffer complete containers; decode only on finalize.
        containerSegments.push(frame);
      },

      finalize: async (): Promise<StreamingSttFinal> => {
        if (finalized) {
          throw providerUnavailable(
            "GCP streaming STT session already finalized",
          );
        }
        finalized = true;
        if (cancelled) {
          throw providerUnavailable("GCP streaming STT session cancelled");
        }
        if (
          !totalBytes ||
          (pcmChunks.length === 0 && containerSegments.length === 0)
        ) {
          throw audioInvalid("GCP streaming STT received empty uplink");
        }

        try {
          if (options.encoding === "pcm_s16le") {
            ensureLivePcmStream();
            if (!recognizeStream || !streamResultPromise) {
              throw providerUnavailable(
                "GCP streaming STT failed to open recognize stream",
              );
            }
            endWritable(recognizeStream);
            const collected = await streamResultPromise;
            if (!collected.transcript.trim() && pcmChunks.length) {
              // Live stream returned nothing — fall back to sync recognize.
              let pcm = Buffer.concat(pcmChunks);
              const energy = measurePcmEnergy(pcm, sampleRateHz);
              if (energy.durationMs > SYNC_RECOGNIZE_MAX_DURATION_MS) {
                pcm = Buffer.from(
                  takePcmTailWindow(
                    pcm,
                    sampleRateHz,
                    SYNC_RECOGNIZE_SAFE_DURATION_MS,
                  ),
                );
                this.logger.warn(
                  `gcp-stream.streaming fallback truncated durationMs=${energy.durationMs} → safe window`,
                );
              }
              this.logger.warn(
                `gcp-stream.streaming empty finals=${collected.finalCount} interims=${collected.interimCount}; falling back to recognize`,
              );
              let batch: CollectedTranscript | undefined;
              for (const fallbackModel of resolveHybridSpeechModels(model)) {
                batch = await this.recognizeLinear16Sync({
                  pcm,
                  sampleRateHz,
                  languageCode,
                  model: fallbackModel,
                });
                if (batch.transcript.trim()) break;
              }
              return this.toFinal(
                batch ?? {
                  transcript: "",
                  finalCount: 0,
                  interimCount: 0,
                  usedInterimFallback: false,
                  via: "recognize",
                },
                pcm.length,
                options.encoding,
                started,
              );
            }
            return this.toFinal(
              collected,
              totalBytes,
              options.encoding,
              started,
            );
          }

          // Hybrid / one-shot m4a: rebuild containers from wire frames, then
          // recognize each valid container. Incomplete m4a without moov are
          // skipped; never hard-fail the whole turn on one bad segment.
          const collected = await this.recognizeHybridSegments({
            segments: rebuildHybridContainers(
              containerSegments,
              options.encoding,
            ),
            encoding: options.encoding,
            sampleRateHz,
            languageCode,
            model,
          });
          return this.toFinal(
            collected,
            collected.audioBytes,
            options.encoding,
            started,
          );
        } catch (err) {
          this.logger.warn(
            `gcp-stream.finalize failed latencyMs=${Date.now() - started}`,
          );
          if (recognizeStream) {
            try {
              destroyWritable(recognizeStream);
            } catch {
              // ignore
            }
          }
          if (err instanceof Error && "getStatus" in err) throw err;
          throw providerUnavailable(
            `GCP streaming STT failed: ${
              err instanceof Error ? err.message : "unknown"
            }`,
          );
        }
      },

      cancel: () => {
        cancelled = true;
        pcmChunks.length = 0;
        containerSegments.length = 0;
        totalBytes = 0;
        if (recognizeStream) {
          try {
            destroyWritable(recognizeStream);
          } catch {
            // ignore
          }
          recognizeStream = undefined;
        }
      },
    };
  }

  private toFinal(
    collected: CollectedTranscript,
    audioBytes: number,
    encoding: string,
    started: number,
  ): StreamingSttFinal {
    const transcript = collected.transcript.trim();
    const latencyMs = Date.now() - started;
    this.logger.log(
      `gcp-stream.finalize collected encoding=${encoding} audioBytes=${audioBytes} finals=${collected.finalCount} interims=${collected.interimCount} usedInterimFallback=${collected.usedInterimFallback} via=${collected.via} latencyMs=${latencyMs}`,
    );
    if (!transcript) {
      throw audioInvalid("GCP streaming STT returned empty transcript");
    }
    return {
      transcript,
      providerName: this.name,
      latencyMs,
    };
  }

  private getClient(): SpeechClient {
    if (!this.client) {
      const projectId = resolveGoogleQuotaProject();
      this.client = projectId
        ? new SpeechClient({ projectId })
        : new SpeechClient();
    }
    return this.client;
  }

  private openStreamingRecognize(args: {
    sampleRateHz: number;
    languageCode: string;
    model: string;
    onPartial?: StreamingSttSessionOptions["onPartial"];
  }): {
    stream: NodeJS.WritableStream;
    result: Promise<CollectedTranscript>;
  } {
    const client = this.getClient();
    const timeoutMs = Number(
      this.config.get<string>("STT_TIMEOUT_MS") ?? 60_000,
    );
    const alternativeLanguageCodes = resolveSpeechAlternativeLanguageCodes(
      args.languageCode,
    );

    const stream = client.streamingRecognize(
      {
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: args.sampleRateHz,
          audioChannelCount: 1,
          languageCode: args.languageCode,
          alternativeLanguageCodes,
          model: args.model,
          enableAutomaticPunctuation: true,
        },
        interimResults: true,
        singleUtterance: false,
      },
      {
        timeout:
          Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
      },
    );

    const result = collectStreamingTranscript(stream, args.onPartial);
    return { stream: stream as unknown as NodeJS.WritableStream, result };
  }

  /**
   * Sync gRPC `recognize` for already-buffered LINEAR16 (hybrid segment path).
   * Prefer this over dumping a finished file into streamingRecognize.
   */
  private async recognizeLinear16Sync(args: {
    pcm: Buffer;
    sampleRateHz: number;
    languageCode: string;
    model: string;
  }): Promise<CollectedTranscript> {
    if (!args.pcm.length) {
      throw audioInvalid("GCP streaming STT audio decode produced empty PCM");
    }

    const client = this.getClient();
    const timeoutMs = Number(
      this.config.get<string>("STT_TIMEOUT_MS") ?? 60_000,
    );
    const alternativeLanguageCodes = resolveSpeechAlternativeLanguageCodes(
      args.languageCode,
    );

    try {
      const [response] = await client.recognize(
        {
          config: {
            encoding: "LINEAR16",
            sampleRateHertz: args.sampleRateHz,
            audioChannelCount: 1,
            languageCode: args.languageCode,
            alternativeLanguageCodes,
            model: args.model,
            enableAutomaticPunctuation: true,
          },
          audio: {
            // gRPC wants raw bytes (Buffer), not base64.
            content: args.pcm,
          },
        },
        {
          timeout:
            Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60_000,
        },
      );

      const results = response.results ?? [];
      const transcript = results
        .map((r) => r.alternatives?.[0]?.transcript?.trim() ?? "")
        .filter((t) => t.length > 0)
        .join(" ")
        .trim();

      this.logger.log(
        `gcp-stream.recognize ok resultCount=${results.length} pcmBytes=${args.pcm.length} language=${args.languageCode} alts=${alternativeLanguageCodes.join(",") || "-"} model=${args.model}`,
      );

      return {
        transcript,
        finalCount: transcript ? results.length : 0,
        interimCount: 0,
        usedInterimFallback: false,
        via: "recognize",
      };
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "unknown";
      const message =
        err instanceof Error ? err.message.slice(0, 160) : "unknown";
      this.logger.warn(
        `gcp-stream.recognize failed code=${code} message=${message}`,
      );
      throw providerUnavailable(
        `GCP streaming STT recognize failed: ${message}`,
      );
    }
  }

  /**
   * Decode hybrid container segments and run sync `recognize` **per valid
   * container**, then join transcripts.
   *
   * Callers should pass containers already rebuilt via `rebuildHybridContainers`
   * (one complete m4a may arrive as several ≤64 KiB wire frames).
   *
   * Why not concat-then-recognize decoded PCM?
   * Sync `recognize` rejects audio > ~60s (`Sync input too long`). Force-demuxing
   * incomplete MP4s as raw AAC also invented huge PCM. Per-container calls stay
   * under the limit for normal holds (≤60s PTT).
   *
   * Incomplete m4a (no `moov`) are soft-skipped — never turn-fatal alone.
   * There is **no** Speech v1 AAC/M4A passthrough — always LINEAR16 via ffmpeg.
   */
  private async recognizeHybridSegments(args: {
    segments: Buffer[];
    encoding: StreamingSttSessionOptions["encoding"];
    sampleRateHz: number;
    languageCode: string;
    model: string;
  }): Promise<CollectedTranscript & { audioBytes: number }> {
    const declaredFormat =
      args.encoding === "segment_wav" ? ("wav" as const) : ("m4a" as const);

    const decoded: Array<{ pcm: Buffer; durationMs: number; peak: number }> =
      [];
    let skippedSegments = 0;
    let moovSegments = 0;
    let webmSegments = 0;
    let skippedNoMoov = 0;
    let truncatedSegments = 0;

    for (const segment of args.segments) {
      if (!segment.length) {
        skippedSegments += 1;
        continue;
      }

      const inputFormat = resolveEffectiveInputFormat(declaredFormat, segment);

      // Incomplete ISO-BMFF without moov: do NOT fall through to raw AAC demux —
      // that path produced >60s PCM and Sync input too long on live PTT.
      // Expo web WebM (EBML) has no moov — keep it and decode as webm.
      if (args.encoding === "segment_m4a") {
        if (inputFormat === "webm" || isWebmEbml(segment)) {
          webmSegments += 1;
        } else if (hasMp4MoovAtom(segment)) {
          moovSegments += 1;
        } else {
          skippedNoMoov += 1;
          skippedSegments += 1;
          this.logger.warn(
            `gcp-stream.segment skipped incomplete m4a (no moov) bytes=${segment.length}`,
          );
          continue;
        }
      }

      try {
        const linear = await transcodeToLinear16(segment, {
          sampleRateHz: args.sampleRateHz,
          inputFormat,
          normalize: true,
        });
        if (!linear.pcm.length) {
          skippedSegments += 1;
          continue;
        }

        let pcm = Buffer.from(linear.pcm);
        let energy = measurePcmEnergy(pcm, args.sampleRateHz);

        // Cap a single segment under sync recognize's ~60s limit (keep tail).
        if (energy.durationMs > SYNC_RECOGNIZE_MAX_DURATION_MS) {
          truncatedSegments += 1;
          pcm = Buffer.from(
            takePcmTailWindow(
              pcm,
              args.sampleRateHz,
              SYNC_RECOGNIZE_SAFE_DURATION_MS,
            ),
          );
          energy = measurePcmEnergy(pcm, args.sampleRateHz);
          this.logger.warn(
            `gcp-stream.segment truncated to durationMs=${energy.durationMs} pcmBytes=${pcm.length}`,
          );
        }

        if (energy.peak < 20) {
          skippedSegments += 1;
          this.logger.warn(
            `gcp-stream.segment near-silent peak=${energy.peak} bytes=${pcm.length}`,
          );
          continue;
        }

        decoded.push({
          pcm,
          durationMs: energy.durationMs,
          peak: energy.peak,
        });
      } catch (err) {
        skippedSegments += 1;
        const msg =
          err instanceof Error ? err.message.slice(0, 120) : "unknown";
        this.logger.warn(
          `gcp-stream.transcode segment skipped encoding=${args.encoding} bytes=${segment.length} err=${msg}`,
        );
      }
    }

    if (!decoded.length) {
      throw audioInvalid(
        `GCP streaming STT could not decode any hybrid segments (skipped=${skippedSegments} noMoov=${skippedNoMoov})`,
      );
    }

    const totalPcmBytes = decoded.reduce((n, d) => n + d.pcm.length, 0);
    const totalDurationMs = decoded.reduce((n, d) => n + d.durationMs, 0);
    const maxPeak = decoded.reduce((n, d) => Math.max(n, d.peak), 0);

    this.logger.log(
      `gcp-stream.finalize ${args.encoding} segments=${args.segments.length} decoded=${decoded.length} skipped=${skippedSegments} noMoov=${skippedNoMoov} truncated=${truncatedSegments} moov=${moovSegments} webm=${webmSegments} pcmBytes=${totalPcmBytes} durationMs=${totalDurationMs} peak=${maxPeak} language=${args.languageCode} model=${args.model} sampleRateHz=${args.sampleRateHz} strategy=per-segment`,
    );

    // Debug dump: longest decoded segment only (not a dangerous concat).
    const longest = decoded.reduce((a, b) =>
      a.pcm.length >= b.pcm.length ? a : b,
    );
    await this.maybeDumpDebugWav(longest.pcm, args.sampleRateHz);

    if (maxPeak < 50) {
      throw audioInvalid(
        "GCP streaming STT audio decode looks silent (no speech energy)",
      );
    }

    // Always prefer latest_short for hybrid PTT clips, even when
    // GCP_SPEECH_STREAM_MODEL / createSession still carries latest_long.
    const modelsToTry = resolveHybridSpeechModels(args.model);

    const texts: string[] = [];
    let finalCount = 0;
    let usedModel = modelsToTry[0] ?? args.model;

    for (let i = 0; i < decoded.length; i++) {
      const part = decoded[i]!;
      let partText = "";
      for (const model of modelsToTry) {
        try {
          const result = await this.recognizeLinear16Sync({
            pcm: part.pcm,
            sampleRateHz: args.sampleRateHz,
            languageCode: args.languageCode,
            model,
          });
          usedModel = model;
          if (result.transcript.trim()) {
            partText = result.transcript.trim();
            finalCount += result.finalCount || 1;
            break;
          }
          this.logger.warn(
            `gcp-stream.segment empty idx=${i} model=${model} pcmBytes=${part.pcm.length} durationMs=${part.durationMs}`,
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message.slice(0, 160) : "unknown";
          // Soft-skip this model only; try the next model before abandoning
          // the segment (latest_long empty/fail should not block latest_short).
          this.logger.warn(
            `gcp-stream.segment recognize failed idx=${i} model=${model} pcmBytes=${part.pcm.length} durationMs=${part.durationMs} message=${message}`,
          );
        }
      }
      if (partText) texts.push(partText);
    }

    const transcript = joinHybridTranscripts(texts);
    this.logger.log(
      `gcp-stream.hybrid joined parts=${texts.length}/${decoded.length} model=${usedModel} pcmBytes=${totalPcmBytes}`,
    );

    return {
      transcript,
      finalCount,
      interimCount: 0,
      usedInterimFallback: false,
      via: "recognize",
      audioBytes: totalPcmBytes,
    };
  }

  /** Optional WAV dump for offline ffprobe (no transcript). */
  private async maybeDumpDebugWav(
    pcm: Buffer,
    sampleRateHz: number,
  ): Promise<void> {
    const enabled =
      (this.config.get<string>("GCP_SPEECH_DEBUG_DUMP") ?? "").trim() === "1";
    if (!enabled) return;
    try {
      const base =
        this.config.get<string>("AUDIO_STORAGE_PATH")?.trim() ||
        join(process.cwd(), "storage", "audio");
      const dir = join(base, "stt-debug");
      await mkdir(dir, { recursive: true });
      const file = join(dir, `pcm-${Date.now()}.wav`);
      await writeFile(file, pcmToWav(pcm, sampleRateHz));
      this.logger.log(
        `gcp-stream.debug dump wav bytes=${pcm.length} pathTail=${file.slice(-64)}`,
      );
    } catch {
      this.logger.warn("gcp-stream.debug dump failed");
    }
  }
}

export type CollectedTranscript = {
  transcript: string;
  finalCount: number;
  interimCount: number;
  usedInterimFallback: boolean;
  via: "streamingRecognize" | "recognize";
};

/** Wrap raw s16le mono PCM in a minimal WAV header (debug dumps only). */
export function pcmToWav(pcm: Buffer, sampleRateHz: number): Buffer {
  const header = Buffer.alloc(44);
  const rate = sampleRateHz > 0 ? sampleRateHz : 16_000;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Keep the trailing window of s16le mono PCM (most recent speech). */
export function takePcmTailWindow(
  pcm: Buffer,
  sampleRateHz: number,
  maxDurationMs: number,
): Buffer {
  const rate = sampleRateHz > 0 ? sampleRateHz : 16_000;
  const maxBytes = Math.max(2, Math.floor((rate * 2 * maxDurationMs) / 1000));
  const even = maxBytes - (maxBytes % 2);
  if (pcm.length <= even) return Buffer.from(pcm);
  return Buffer.from(pcm.subarray(pcm.length - even));
}

/**
 * Rebuild complete container buffers from wire frames.
 *
 * Mobile one-shot uplink may split a single finalized m4a across several
 * `audio.frame`s (≤64 KiB each). Those frames are **not** independent MP4s —
 * only the concatenated bytes have a `moov`. Detect that case and concat.
 *
 * Legacy multi-clip hybrid (each frame already a complete container with moov)
 * is left as separate segments so we can still recognize per clip.
 */
export function rebuildHybridContainers(
  frames: Buffer[],
  encoding: StreamingSttSessionOptions["encoding"],
): Buffer[] {
  const nonEmpty = frames.filter((f) => f.length > 0);
  if (nonEmpty.length === 0) return [];
  if (encoding === "segment_wav") {
    // WAV header lives in the first chunk; always concat wire frames.
    return [Buffer.concat(nonEmpty)];
  }
  if (encoding !== "segment_m4a") {
    return nonEmpty;
  }

  // Expo web WebM: EBML header is only in the first chunk; always concat.
  if (isWebmEbml(nonEmpty[0]!)) {
    return [Buffer.concat(nonEmpty)];
  }

  const withMoov = nonEmpty.filter((f) => hasMp4MoovAtom(f));
  // Already complete containers (legacy rolling clips that finalized properly).
  if (withMoov.length === nonEmpty.length) {
    return nonEmpty;
  }
  // One or more frames lack moov — treat the whole turn as a single chunked file.
  const joined = Buffer.concat(nonEmpty);
  if (hasMp4MoovAtom(joined) || isWebmEbml(joined)) {
    return [joined];
  }
  // Still no moov after concat: keep originals so per-segment skip/logging runs.
  return nonEmpty;
}

/**
 * Join per-segment transcripts. Drops exact consecutive duplicates that appear
 * when Expo hybrid rolls overlap slightly.
 */
export function joinHybridTranscripts(parts: string[]): string {
  const out: string[] = [];
  for (const raw of parts) {
    const text = raw.trim();
    if (!text) continue;
    const prev = out[out.length - 1];
    if (prev && prev === text) continue;
    // If the new text fully contains the previous (growing overlap), replace.
    if (prev && text.startsWith(prev)) {
      out[out.length - 1] = text;
      continue;
    }
    // If previous fully contains the new text, keep previous.
    if (prev && prev.includes(text)) continue;
    out.push(text);
  }
  return out.join(" ").trim();
}

/** Peak / RMS over int16 LE mono — metrics only, never log samples. */
export function measurePcmEnergy(
  pcm: Buffer,
  sampleRateHz = 16_000,
): {
  peak: number;
  rms: number;
  durationMs: number;
} {
  const samples = Math.floor(pcm.length / 2);
  if (samples <= 0) {
    return { peak: 0, rms: 0, durationMs: 0 };
  }
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) {
    const sample = pcm.readInt16LE(i);
    const abs = Math.abs(sample);
    if (abs > peak) peak = abs;
    sumSq += sample * sample;
  }
  const rms = Math.round(Math.sqrt(sumSq / samples));
  const rate = sampleRateHz > 0 ? sampleRateHz : 16_000;
  const durationMs = Math.round((samples / rate) * 1000);
  return { peak, rms, durationMs };
}

function resolveSampleRateHz(
  options: StreamingSttSessionOptions,
  config: ConfigService,
): number {
  // For hybrid containers the wire sampleRateHz is ignored (contracts); always
  // use configured LINEAR16 target after ffmpeg decode.
  if (
    options.encoding === "pcm_s16le" &&
    options.sampleRateHz &&
    options.sampleRateHz > 0
  ) {
    return options.sampleRateHz;
  }
  const configured = Number(
    config.get<string>("GCP_SPEECH_SAMPLE_RATE_HERTZ") ?? 16_000,
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 16_000;
}

function writePcmInChunks(stream: NodeJS.WritableStream, pcm: Buffer): void {
  for (
    let offset = 0;
    offset < pcm.length;
    offset += STREAM_WRITE_CHUNK_BYTES
  ) {
    const slice = pcm.subarray(offset, offset + STREAM_WRITE_CHUNK_BYTES);
    stream.write(Buffer.from(slice));
  }
}

/**
 * Pace pre-buffered PCM at ~realtime when using streamingRecognize.
 * Kept for tests / optional live-dump; hybrid path uses sync recognize instead.
 */
export async function writePcmRealtimeAsync(
  stream: NodeJS.WritableStream,
  pcm: Buffer,
  sampleRateHz: number,
): Promise<void> {
  const bytesPerChunk = Math.max(
    2,
    Math.floor((sampleRateHz * 2 * STREAM_REALTIME_CHUNK_MS) / 1000),
  );
  for (let offset = 0; offset < pcm.length; offset += bytesPerChunk) {
    const slice = pcm.subarray(offset, offset + bytesPerChunk);
    stream.write(Buffer.from(slice));
    if (offset + bytesPerChunk < pcm.length) {
      await sleep(STREAM_REALTIME_CHUNK_MS);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function endWritable(stream: NodeJS.WritableStream): void {
  if (typeof (stream as { end?: () => void }).end === "function") {
    (stream as { end: () => void }).end();
  }
}

function destroyWritable(stream: NodeJS.WritableStream): void {
  const anyStream = stream as {
    destroy?: (err?: Error) => void;
    end?: () => void;
  };
  if (typeof anyStream.destroy === "function") {
    anyStream.destroy();
    return;
  }
  if (typeof anyStream.end === "function") {
    anyStream.end();
  }
}

/**
 * Collect finals from streamingRecognize. If the stream closes with only
 * interim hypotheses (common on short PTT), use the last interim text.
 * Never logs transcript text.
 */
export function collectStreamingTranscript(
  stream: NodeJS.EventEmitter,
  onPartial?: StreamingSttSessionOptions["onPartial"],
): Promise<CollectedTranscript> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finals: string[] = [];
    let lastInterim = "";
    let interimCount = 0;
    let dataEvents = 0;

    const settleOk = (value: CollectedTranscript) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const settleErr = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const finish = () => {
      const joined = finals.join(" ").trim();
      if (joined) {
        settleOk({
          transcript: joined,
          finalCount: finals.length,
          interimCount,
          usedInterimFallback: false,
          via: "streamingRecognize",
        });
        return;
      }
      const interim = lastInterim.trim();
      settleOk({
        transcript: interim,
        finalCount: 0,
        interimCount,
        usedInterimFallback: interim.length > 0,
        via: "streamingRecognize",
      });
    };

    stream.on("data", (response: StreamingRecognizeResponse) => {
      dataEvents += 1;
      if (response.error?.message) {
        settleErr(
          providerUnavailable(
            `GCP streaming STT error: ${response.error.message}`,
          ),
        );
        return;
      }
      const results = response.results ?? [];
      if (results.length === 0 && dataEvents === 1) {
        // Empty first data event is normal; keep listening.
      }
      for (const result of results) {
        if (!result) continue;
        const text = result.alternatives?.[0]?.transcript?.trim() ?? "";
        if (!text) continue;
        if (result.isFinal) {
          finals.push(text);
        } else {
          interimCount += 1;
          lastInterim = text;
          if (onPartial) {
            onPartial({ text, isFinal: false });
          }
        }
      }
    });

    stream.on("error", (err: unknown) => {
      const message =
        err instanceof Error ? err.message.slice(0, 160) : "unknown";
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      settleErr(
        providerUnavailable(
          `GCP streaming STT stream error${code ? ` code=${code}` : ""}: ${message}`,
        ),
      );
    });

    stream.on("end", finish);
    stream.on("close", () => {
      if (!settled) finish();
    });
  });
}
