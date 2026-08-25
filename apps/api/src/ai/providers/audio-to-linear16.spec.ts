/**
 * Lightweight self-check for GCP STT audio decode helpers.
 * Run: `pnpm --filter @aura/api exec tsx src/ai/providers/audio-to-linear16.spec.ts`
 * (Jest lands with qa-worker; this file is executable via tsx today.)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasMp4MoovAtom,
  isWebmEbml,
  mimeNeedsLinear16Transcode,
  resolveEffectiveInputFormat,
  transcodeToLinear16,
} from "./audio-to-linear16";

function testMimeRouting(): void {
  assert.equal(mimeNeedsLinear16Transcode("audio/mp4"), true);
  assert.equal(mimeNeedsLinear16Transcode("audio/m4a"), true);
  assert.equal(mimeNeedsLinear16Transcode("audio/x-m4a"), true);
  assert.equal(mimeNeedsLinear16Transcode("audio/aac"), true);
  assert.equal(mimeNeedsLinear16Transcode("audio/mpeg"), true);
  assert.equal(mimeNeedsLinear16Transcode("audio/webm"), true);
  assert.equal(mimeNeedsLinear16Transcode("audio/wav"), false);
  assert.equal(mimeNeedsLinear16Transcode("audio/x-wav"), false);
  assert.equal(mimeNeedsLinear16Transcode("audio/pcm"), false);
  assert.equal(mimeNeedsLinear16Transcode("audio/flac"), false);
  assert.equal(mimeNeedsLinear16Transcode(""), false);
}

function testInputSniffViaTranscodeName(): void {
  assert.equal(mimeNeedsLinear16Transcode("audio/mp4"), true);
}

function testMoovDetection(): void {
  // Minimal fake: embed "moov" somewhere after an ftyp-like header.
  const withMoov = Buffer.alloc(32, 0);
  withMoov.write("ftyp", 4);
  withMoov.write("moov", 16);
  assert.equal(hasMp4MoovAtom(withMoov), true);
  assert.equal(hasMp4MoovAtom(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7])), false);
}

function testWebmSniffOverridesDeclaredM4a(): void {
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3]);
  assert.equal(isWebmEbml(webm), true);
  assert.equal(isWebmEbml(Buffer.from([0, 1, 2, 3])), false);
  // Expo web declares m4a while MediaRecorder emits WebM — sniff wins.
  assert.equal(resolveEffectiveInputFormat("m4a", webm), "webm");
  assert.equal(resolveEffectiveInputFormat("auto", webm), "webm");

  const withMoov = Buffer.alloc(32, 0);
  withMoov.write("ftyp", 4);
  withMoov.write("moov", 16);
  assert.equal(resolveEffectiveInputFormat("m4a", withMoov), "m4a");
  assert.equal(resolveEffectiveInputFormat("mp4", withMoov), "mp4");
}


async function testFfmpegRoundTripIfAvailable(): Promise<void> {
  const ffmpeg =
    process.env.FFMPEG_PATH?.trim() ||
    (spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0
      ? "ffmpeg"
      : null);
  if (!ffmpeg) {
    console.log("skip: ffmpeg not on PATH (install for decode round-trip)");
    return;
  }

  // 0.25s mono 440Hz sine as WAV, then re-encode to AAC-in-MP4 (m4a-like).
  const wav = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.25",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      "pipe:1",
    ],
    { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 },
  );
  assert.equal(wav.status, 0, "ffmpeg sine→wav failed");
  assert.ok(wav.stdout.length > 44, "expected wav bytes");

  // MP4 mux needs a seekable file (pipe:1 fails without fragmented flags).
  const dir = await mkdtemp(join(tmpdir(), "aura-stt-spec-"));
  try {
    const wavPath = join(dir, "sine.wav");
    const m4aPath = join(dir, "sine.m4a");
    const webmPath = join(dir, "sine.webm");
    await writeFile(wavPath, wav.stdout);

    const m4a = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        wavPath,
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        m4aPath,
      ],
      { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 },
    );
    assert.equal(m4a.status, 0, "ffmpeg wav→m4a failed");
    const m4aBytes = await readFile(m4aPath);
    assert.ok(m4aBytes.length > 0, "expected m4a bytes");
    assert.ok(hasMp4MoovAtom(m4aBytes), "expected moov in complete m4a");

    const linear = await transcodeToLinear16(m4aBytes, {
      sampleRateHz: 16_000,
      ffmpegPath: ffmpeg,
      inputFormat: "m4a",
      normalize: true,
    });
    assert.equal(linear.sampleRateHz, 16_000);
    assert.equal(linear.channels, 1);
    // ~0.25s * 16000 * 2 bytes ≈ 8000; AAC padding can vary — require some PCM.
    assert.ok(linear.pcm.length >= 2000, `pcm too short: ${linear.pcm.length}`);
    // loudnorm should produce audible energy on a sine source.
    let peak = 0;
    for (let i = 0; i + 1 < linear.pcm.length; i += 2) {
      const s = Math.abs(linear.pcm.readInt16LE(i));
      if (s > peak) peak = s;
    }
    assert.ok(peak > 1000, `expected normalized peak > 1000, got ${peak}`);

    // Expo web path: WebM bytes declared as m4a must still decode.
    const webm = spawnSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        wavPath,
        "-c:a",
        "libopus",
        "-f",
        "webm",
        webmPath,
      ],
      { encoding: "buffer", maxBuffer: 2 * 1024 * 1024 },
    );
    assert.equal(webm.status, 0, "ffmpeg wav→webm failed");
    const webmBytes = await readFile(webmPath);
    assert.ok(isWebmEbml(webmBytes), "expected EBML magic on webm");
    assert.equal(hasMp4MoovAtom(webmBytes), false);

    const webmLinear = await transcodeToLinear16(webmBytes, {
      sampleRateHz: 16_000,
      ffmpegPath: ffmpeg,
      // Intentionally wrong declared format — sniff must override.
      inputFormat: "m4a",
      normalize: true,
    });
    assert.ok(
      webmLinear.pcm.length >= 2000,
      `webm pcm too short: ${webmLinear.pcm.length}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function testIncompleteMp4IsSoftFailure(): Promise<void> {
  // Truncated MP4 without moov must throw before ffmpeg invents huge PCM.
  const trunc = Buffer.alloc(64, 0);
  trunc.write("ftyp", 4);
  await assert.rejects(
    () =>
      transcodeToLinear16(trunc, {
        sampleRateHz: 16_000,
        inputFormat: "m4a",
        normalize: false,
      }),
    /incomplete m4a\/mp4/,
  );
}

async function main(): Promise<void> {
  testMimeRouting();
  testInputSniffViaTranscodeName();
  testMoovDetection();
  testWebmSniffOverridesDeclaredM4a();
  await testFfmpegRoundTripIfAvailable();
  await testIncompleteMp4IsSoftFailure();
  console.log("audio-to-linear16.spec.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
