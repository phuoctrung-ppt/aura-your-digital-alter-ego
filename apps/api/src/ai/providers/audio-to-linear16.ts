import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Linear16Pcm = {
  /** Raw little-endian signed 16-bit PCM (no WAV header). */
  pcm: Buffer;
  sampleRateHz: number;
  channels: 1;
};

export type TranscodeToLinear16Options = {
  /** Target sample rate for Speech LINEAR16 (default 16000). */
  sampleRateHz?: number;
  /** Override ffmpeg binary path (`FFMPEG_PATH` env otherwise `ffmpeg`). */
  ffmpegPath?: string;
  /** Wall-clock timeout for the ffmpeg process (default 30s). */
  timeoutMs?: number;
  /**
   * Hint for the input container so ffmpeg does not mis-probe a `.bin` file.
   * Expo hybrid uplink is AAC-in-MP4 (`.m4a`) when the file is complete.
   */
  inputFormat?: "m4a" | "mp4" | "aac" | "mp3" | "wav" | "webm" | "ogg" | "auto";
  /**
   * Apply loudnorm so quiet mobile mics are Speech-friendly.
   * Default true.
   */
  normalize?: boolean;
};

/**
 * Decode containerized / compressed audio (m4a/AAC, mp3, webm, …) to mono
 * LINEAR16 PCM suitable for Cloud Speech-to-Text `encoding: LINEAR16`.
 *
 * Speech v1 does **not** accept AAC/M4A/MP4 (no passthrough encoding). Expo
 * `segment_m4a` uplink must be a **complete** AAC-in-MP4 with a `moov` atom
 * (one-shot stop on PTT release, or legacy clips that finalized properly).
 * Incomplete fragments without moov fail fast — raw AAC demux invented huge
 * PCM and tripped Speech's sync 60s limit.
 *
 * Requires a host `ffmpeg` binary (`FFMPEG_PATH` or PATH).
 */
export async function transcodeToLinear16(
  input: Buffer,
  options: TranscodeToLinear16Options = {},
): Promise<Linear16Pcm> {
  if (!input.length) {
    throw new Error("Cannot transcode empty audio buffer");
  }

  const sampleRateHz =
    options.sampleRateHz && options.sampleRateHz > 0
      ? options.sampleRateHz
      : 16_000;
  const ffmpegPath =
    options.ffmpegPath?.trim() ||
    process.env.FFMPEG_PATH?.trim() ||
    "ffmpeg";
  const timeoutMs =
    options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 30_000;
  const normalize = options.normalize !== false;
  // Expo web MediaRecorder emits WebM even when the client declares
  // segment_m4a / inputFormat m4a. Prefer byte sniff over the declared hint.
  const inputFormat = resolveEffectiveInputFormat(
    options.inputFormat ?? "auto",
    input,
  );

  // Declared m4a/mp4 without moov is incomplete — do NOT fall through to raw
  // AAC demux. That path can invent multi-minute PCM and trip Speech's sync
  // recognize 60s limit (`Sync input too long`). WebM is handled separately
  // (EBML; no moov) after sniff override above.
  if (
    (inputFormat === "m4a" || inputFormat === "mp4") &&
    !hasMp4MoovAtom(input)
  ) {
    throw new Error("incomplete m4a/mp4 (moov atom not found)");
  }

  const dir = await mkdtemp(join(tmpdir(), "aura-stt-"));
  const inName = inputFileName(inputFormat, input);
  const inPath = join(dir, inName);
  const outPath = join(dir, "output.s16le");

  const filter = normalize
    ? "pan=mono|c0=0.5*c0+0.5*c1,loudnorm=I=-16:TP=-1.5:LRA=11"
    : "pan=mono|c0=0.5*c0+0.5*c1";

  // Demux attempts ordered for Expo hybrid reality:
  // 1) auto-probe by extension (complete m4a / webm)
  // 2) explicit mp4 when moov is present
  // 3) explicit webm when EBML magic is present
  // 4) raw AAC / ADTS only for non-m4a containers / auto sniff
  const demuxAttempts: Array<string[] | undefined> = [undefined];
  if (hasMp4MoovAtom(input)) {
    demuxAttempts.push(["-f", "mp4"]);
  } else if (isWebmEbml(input) || inputFormat === "webm") {
    demuxAttempts.push(["-f", "webm"]);
  } else if (inputFormat === "aac" || inputFormat === "auto") {
    demuxAttempts.push(["-f", "aac"]);
  }

  try {
    await writeFile(inPath, input);
    let lastErr: Error | undefined;
    for (const demux of demuxAttempts) {
      try {
        await runFfmpeg(
          ffmpegPath,
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            ...(demux ?? []),
            "-i",
            inPath,
            "-vn",
            "-af",
            filter,
            "-ac",
            "1",
            "-ar",
            String(sampleRateHz),
            "-f",
            "s16le",
            "-acodec",
            "pcm_s16le",
            outPath,
          ],
          timeoutMs,
        );
        const pcm = await readFile(outPath);
        if (!pcm.length) {
          throw new Error("ffmpeg produced empty PCM output");
        }
        return { pcm, sampleRateHz, channels: 1 };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        // try next demux strategy
      }
    }
    throw lastErr ?? new Error("ffmpeg demux failed");
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Re-loudnorm already-decoded s16le mono PCM (e.g. after concatenating hybrid
 * segment PCM). Useful when per-segment levels vary.
 */
export async function normalizeLinear16Pcm(
  pcm: Buffer,
  options: {
    sampleRateHz?: number;
    ffmpegPath?: string;
    timeoutMs?: number;
  } = {},
): Promise<Linear16Pcm> {
  if (!pcm.length) {
    throw new Error("Cannot normalize empty PCM buffer");
  }
  const sampleRateHz =
    options.sampleRateHz && options.sampleRateHz > 0
      ? options.sampleRateHz
      : 16_000;
  const ffmpegPath =
    options.ffmpegPath?.trim() ||
    process.env.FFMPEG_PATH?.trim() ||
    "ffmpeg";
  const timeoutMs =
    options.timeoutMs && options.timeoutMs > 0 ? options.timeoutMs : 30_000;

  const dir = await mkdtemp(join(tmpdir(), "aura-stt-norm-"));
  const inPath = join(dir, "input.s16le");
  const outPath = join(dir, "output.s16le");
  try {
    await writeFile(inPath, pcm);
    await runFfmpeg(
      ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "s16le",
        "-ar",
        String(sampleRateHz),
        "-ac",
        "1",
        "-i",
        inPath,
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11",
        "-f",
        "s16le",
        "-acodec",
        "pcm_s16le",
        outPath,
      ],
      timeoutMs,
    );
    const out = await readFile(outPath);
    if (!out.length) {
      throw new Error("ffmpeg normalize produced empty PCM");
    }
    return { pcm: out, sampleRateHz, channels: 1 };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** True when buffer looks like ISO-BMFF with a `moov` atom (complete m4a/mp4). */
export function hasMp4MoovAtom(input: Buffer): boolean {
  if (input.length < 8) return false;
  return input.includes(Buffer.from("moov"));
}

/**
 * True when buffer starts with EBML magic (`1A 45 DF A3`) — WebM/Matroska.
 * Expo web `RecordingPresets.HIGH_QUALITY.web.mimeType` is `audio/webm`.
 */
export function isWebmEbml(input: Buffer): boolean {
  return (
    input.length >= 4 &&
    input[0] === 0x1a &&
    input[1] === 0x45 &&
    input[2] === 0xdf &&
    input[3] === 0xa3
  );
}

/**
 * Prefer container bytes over a declared format. Callers may label Expo web
 * uplink as `m4a` while the payload is WebM (no `moov`).
 */
export function resolveEffectiveInputFormat(
  declared: TranscodeToLinear16Options["inputFormat"],
  input: Buffer,
): TranscodeToLinear16Options["inputFormat"] {
  if (isWebmEbml(input)) return "webm";
  if (hasMp4MoovAtom(input)) {
    if (declared === "mp4") return "mp4";
    return "m4a";
  }
  return declared ?? "auto";
}

/**
 * True when the MIME (or filename hint) is a container/codec Speech v1 cannot
 * ingest directly as LINEAR16 — needs ffmpeg (or another decoder) first.
 */
export function mimeNeedsLinear16Transcode(mimeType: string): boolean {
  const mime = (mimeType || "").toLowerCase();
  if (!mime) return false;
  if (mime.includes("wav") || mime.includes("wave") || mime.includes("pcm")) {
    return false;
  }
  if (mime.includes("flac")) return false;
  return (
    mime.includes("mp4") ||
    mime.includes("m4a") ||
    mime.includes("aac") ||
    mime.includes("mpeg") ||
    mime.includes("mp3") ||
    mime.includes("webm") ||
    mime.includes("ogg") ||
    mime.includes("opus")
  );
}

export function inputFormatFromMime(
  mimeType: string | undefined,
): TranscodeToLinear16Options["inputFormat"] {
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) {
    return "m4a";
  }
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav") || mime.includes("wave")) return "wav";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg") || mime.includes("opus")) return "ogg";
  return "auto";
}

function inputFileName(
  inputFormat: TranscodeToLinear16Options["inputFormat"],
  input: Buffer,
): string {
  switch (inputFormat) {
    case "m4a":
    case "mp4":
    case "aac":
      // Prefer .m4a when moov present; otherwise .aac helps ADTS probe.
      return hasMp4MoovAtom(input) ? "input.m4a" : "input.aac";
    case "mp3":
      return "input.mp3";
    case "wav":
      return "input.wav";
    case "webm":
      return "input.webm";
    case "ogg":
      return "input.ogg";
    default:
      return sniffContainerFileName(input);
  }
}

function sniffContainerFileName(input: Buffer): string {
  if (input.length >= 12) {
    if (
      input[4] === 0x66 &&
      input[5] === 0x74 &&
      input[6] === 0x79 &&
      input[7] === 0x70
    ) {
      return hasMp4MoovAtom(input) ? "input.m4a" : "input.aac";
    }
    if (input[0] === 0x49 && input[1] === 0x44 && input[2] === 0x33) {
      return "input.mp3";
    }
    if (input[0] === 0xff && (input[1] & 0xe0) === 0xe0) {
      return "input.aac";
    }
    if (
      input[0] === 0x52 &&
      input[1] === 0x49 &&
      input[2] === 0x46 &&
      input[3] === 0x46
    ) {
      return "input.wav";
    }
    if (
      input[0] === 0x1a &&
      input[1] === 0x45 &&
      input[2] === 0xdf &&
      input[3] === 0xa3
    ) {
      return "input.webm";
    }
    if (input[0] === 0x4f && input[1] === 0x67 && input[2] === 0x67) {
      return "input.ogg";
    }
  }
  return hasMp4MoovAtom(input) ? "input.m4a" : "input.aac";
}

function runFfmpeg(
  ffmpegPath: string,
  args: string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const stderrChunks: Buffer[] = [];
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrChunks.length < 16) stderrChunks.push(chunk);
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        reject(
          new Error(
            `ffmpeg not found (${ffmpegPath}). Install ffmpeg or set FFMPEG_PATH for GCP Speech m4a/AAC decode`,
          ),
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks)
        .toString("utf8")
        .trim()
        .slice(0, 240);
      reject(
        new Error(
          stderr
            ? `ffmpeg exited ${code}: ${stderr}`
            : `ffmpeg exited ${code}`,
        ),
      );
    });
  });
}
