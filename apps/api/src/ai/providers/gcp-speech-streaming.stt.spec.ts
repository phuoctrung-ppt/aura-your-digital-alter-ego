/**
 * Lightweight self-check for GCP streaming STT helpers.
 * Run: `pnpm --filter @aura/api exec tsx src/ai/providers/gcp-speech-streaming.stt.spec.ts`
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  resolveHybridSpeechModels,
  resolveSpeechAlternativeLanguageCodes,
  resolveSpeechLanguageCode,
} from "./gcp-speech-language";
import {
  collectStreamingTranscript,
  joinHybridTranscripts,
  measurePcmEnergy,
  rebuildHybridContainers,
  takePcmTailWindow,
} from "./gcp-speech-streaming.stt";

function testLanguageMapping(): void {
  assert.equal(resolveSpeechLanguageCode("vi", undefined), "vi-VN");
  assert.equal(resolveSpeechLanguageCode("vn", undefined), "vi-VN");
  assert.equal(resolveSpeechLanguageCode(undefined, undefined), "vi-VN");
  assert.equal(resolveSpeechLanguageCode("vi-VN", undefined), "vi-VN");
  assert.equal(resolveSpeechLanguageCode("en_US", undefined), "en-US");
  assert.equal(resolveSpeechLanguageCode("vi", "en-US"), "en-US");
  assert.equal(resolveSpeechLanguageCode("en", "  "), "en");
  assert.equal(resolveSpeechLanguageCode("vi", "vi"), "vi-VN");

  assert.deepEqual(resolveSpeechAlternativeLanguageCodes("vi-VN"), ["en-US"]);
  assert.deepEqual(resolveSpeechAlternativeLanguageCodes("en-US"), ["vi-VN"]);
  assert.deepEqual(resolveSpeechAlternativeLanguageCodes("vi"), ["en-US"]);
  assert.deepEqual(resolveSpeechAlternativeLanguageCodes("fr-FR"), [
    "vi-VN",
    "en-US",
  ]);

  assert.deepEqual(resolveHybridSpeechModels(undefined), [
    "latest_short",
    "latest_long",
  ]);
  assert.deepEqual(resolveHybridSpeechModels("latest_short"), [
    "latest_short",
    "latest_long",
  ]);
  assert.deepEqual(resolveHybridSpeechModels("latest_long"), [
    "latest_short",
    "latest_long",
  ]);
  assert.deepEqual(resolveHybridSpeechModels("command_and_search"), [
    "latest_short",
    "command_and_search",
    "latest_long",
  ]);
}

async function testCollectFinalsPreferred(): Promise<void> {
  const stream = new EventEmitter();
  const partials: string[] = [];
  const pending = collectStreamingTranscript(stream, (p) => {
    partials.push(p.text);
  });

  stream.emit("data", {
    results: [
      {
        alternatives: [{ transcript: "Xin " }],
        isFinal: false,
      },
    ],
  });
  stream.emit("data", {
    results: [
      {
        alternatives: [{ transcript: "Xin chào" }],
        isFinal: true,
      },
    ],
  });
  stream.emit("data", {
    results: [
      {
        alternatives: [{ transcript: " bạn" }],
        isFinal: true,
      },
    ],
  });
  stream.emit("end");

  const collected = await pending;
  assert.equal(collected.transcript, "Xin chào bạn");
  assert.equal(collected.finalCount, 2);
  assert.equal(collected.usedInterimFallback, false);
  assert.equal(collected.via, "streamingRecognize");
  assert.deepEqual(partials, ["Xin"]);
}

async function testCollectInterimFallbackOnClose(): Promise<void> {
  const stream = new EventEmitter();
  const pending = collectStreamingTranscript(stream);
  stream.emit("data", {
    results: [
      {
        alternatives: [{ transcript: "Xin chào các bạn" }],
        isFinal: false,
      },
    ],
  });
  stream.emit("close");
  const collected = await pending;
  assert.equal(collected.transcript, "Xin chào các bạn");
  assert.equal(collected.finalCount, 0);
  assert.equal(collected.interimCount, 1);
  assert.equal(collected.usedInterimFallback, true);
  assert.equal(collected.via, "streamingRecognize");
}

async function testCollectEmptyOnClose(): Promise<void> {
  const stream = new EventEmitter();
  const pending = collectStreamingTranscript(stream);
  stream.emit("data", { results: [] });
  stream.emit("close");
  const collected = await pending;
  assert.equal(collected.transcript, "");
  assert.equal(collected.usedInterimFallback, false);
}

async function testCollectStreamError(): Promise<void> {
  const stream = new EventEmitter();
  const pending = collectStreamingTranscript(stream);
  stream.emit("error", new Error("boom"));
  await assert.rejects(pending, /GCP streaming STT stream error/);
}


function testTakePcmTailWindow(): void {
  // 3 seconds of 16kHz mono s16le = 96000 bytes
  const pcm = Buffer.alloc(96_000, 1);
  const clipped = takePcmTailWindow(pcm, 16_000, 1_000);
  // 1s * 16000 * 2 = 32000
  assert.equal(clipped.length, 32_000);
  const short = takePcmTailWindow(Buffer.alloc(100), 16_000, 1_000);
  assert.equal(short.length, 100);
}

function testJoinHybridTranscripts(): void {
  assert.equal(joinHybridTranscripts(["Xin chào", "bạn"]), "Xin chào bạn");
  assert.equal(joinHybridTranscripts(["Xin chào", "Xin chào"]), "Xin chào");
  assert.equal(
    joinHybridTranscripts(["Xin", "Xin chào"]),
    "Xin chào",
  );
  assert.equal(joinHybridTranscripts(["Xin chào các bạn", "các bạn"]), "Xin chào các bạn");
  assert.equal(joinHybridTranscripts(["", "  "]), "");
}

function testRebuildHybridContainers(): void {
  // Chunked one-shot m4a: only the concat has moov.
  const partA = Buffer.alloc(24, 0);
  partA.write("ftyp", 4);
  const partB = Buffer.alloc(24, 0);
  partB.write("moov", 8);
  const rebuilt = rebuildHybridContainers([partA, partB], "segment_m4a");
  assert.equal(rebuilt.length, 1);
  assert.equal(rebuilt[0]!.length, 48);
  assert.ok(rebuilt[0]!.includes(Buffer.from("moov")));

  // Legacy: each frame already complete with moov → keep separate.
  const clip1 = Buffer.alloc(16, 1);
  clip1.write("moov", 4);
  const clip2 = Buffer.alloc(16, 2);
  clip2.write("moov", 4);
  const legacy = rebuildHybridContainers([clip1, clip2], "segment_m4a");
  assert.equal(legacy.length, 2);

  // Expo web WebM: EBML only in first frame — always concat even under segment_m4a.
  const webmHead = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
  const webmTail = Buffer.alloc(8, 9);
  const webm = rebuildHybridContainers([webmHead, webmTail], "segment_m4a");
  assert.equal(webm.length, 1);
  assert.equal(webm[0]!.length, 16);
  assert.equal(webm[0]![0], 0x1a);
  assert.equal(webm[0]![3], 0xa3);

  // WAV frames always concat (header in first chunk).
  const wav = rebuildHybridContainers(
    [Buffer.from([1, 2]), Buffer.from([3, 4])],
    "segment_wav",
  );
  assert.equal(wav.length, 1);
  assert.deepEqual([...wav[0]!], [1, 2, 3, 4]);
}
function testPcmEnergy(): void {
  // 1000 samples of amplitude 1000 at 16kHz ≈ 62.5ms
  const pcm = Buffer.alloc(2000);
  for (let i = 0; i < 1000; i++) {
    pcm.writeInt16LE(1000, i * 2);
  }
  const e = measurePcmEnergy(pcm);
  assert.equal(e.peak, 1000);
  assert.equal(e.rms, 1000);
  assert.equal(e.durationMs, 63);

  const silent = measurePcmEnergy(Buffer.alloc(3200));
  assert.equal(silent.peak, 0);
  assert.equal(silent.rms, 0);
}

async function main(): Promise<void> {
  testLanguageMapping();
  await testCollectFinalsPreferred();
  await testCollectInterimFallbackOnClose();
  await testCollectEmptyOnClose();
  await testCollectStreamError();
  testPcmEnergy();
  testTakePcmTailWindow();
  testJoinHybridTranscripts();
  testRebuildHybridContainers();
  console.log("gcp-speech-streaming.stt.spec.ts: ok");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
