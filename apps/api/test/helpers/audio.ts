/**
 * Tiny silent WAV fixture for multipart turn tests (M12).
 * Matches smoke-m5.py generation (mono PCM, short silence).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Build a minimal RIFF/WAVE buffer (mono, 16-bit PCM, 8 kHz, ~0.1s silence). */
export function buildSilentWavBuffer(
  sampleRate = 8000,
  durationSec = 0.1,
): Buffer {
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // audio format PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // samples already zeroed
  return buffer;
}

/** Write silent WAV to a temp path and return absolute path. */
export function writeSilentWavFixture(filename = "m12-silence.wav"): string {
  const dir = join(tmpdir(), "aura-jest-fixtures");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, filename);
  writeFileSync(path, buildSilentWavBuffer());
  return path;
}
