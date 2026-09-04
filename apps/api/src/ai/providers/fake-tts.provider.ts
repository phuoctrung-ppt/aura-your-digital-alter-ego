import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TtsProvider, TtsRequest, TtsResult } from "../interfaces/tts-provider";
import { VoiceDTO } from "@aura/contracts";

/** Build a tiny valid mono PCM WAV (silence). */
function buildSilentWav(
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
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // samples already zeroed
  return buffer;
}

const SILENT_WAV = buildSilentWav();

@Injectable()
export class FakeTtsProvider implements TtsProvider {
  readonly name = "fake-tts";

  constructor(private readonly config: ConfigService) {}

  async synthesize(_request: TtsRequest): Promise<TtsResult> {
    const started = Date.now();
    const root =
      this.config.get<string>("AUDIO_STORAGE_PATH")?.trim() ||
      join(process.cwd(), ".aura-audio");
    const dir = join(root, "_tts-fake");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `${randomUUID()}.wav`);
    await writeFile(filePath, SILENT_WAV);
    return {
      audioUri: filePath,
      providerName: this.name,
      mimeType: "audio/wav",
      latencyMs: Date.now() - started,
    };
  }

  async listVoices(locale: string): Promise<VoiceDTO[]> {
    return [
      {
        id: "fake-voice-1",
        name: "Fake Voice 1",
        provider: this.name,
        locale,
        isRecommended: true,
      },
    ];
  }
}
