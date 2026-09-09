import { Injectable } from "@nestjs/common";
import type {
  StreamingSttFinal,
  StreamingSttProvider,
  StreamingSttSession,
  StreamingSttSessionOptions,
} from "../interfaces/streaming-stt-provider";
import { FakeSttProvider } from "./fake-stt.provider";

/**
 * Fake streaming STT for CI / `AI_PROVIDER_MODE=fake`.
 * Buffers PCM/segment frames, may emit one optional partial, then returns the
 * same fixture transcript as batch `FakeSttProvider`.
 */
@Injectable()
export class FakeStreamingSttProvider implements StreamingSttProvider {
  readonly name = "fake-stt";

  constructor(private readonly batch: FakeSttProvider) {}

  createSession(options: StreamingSttSessionOptions): StreamingSttSession {
    const chunks: Buffer[] = [];
    let cancelled = false;
    let finalized = false;
    const started = Date.now();
    let partialEmitted = false;

    return {
      pushAudio: (frame: Buffer) => {
        if (cancelled || finalized) return;
        if (frame.length > 0) {
          chunks.push(frame);
        }
        // Optional single partial once we have some audio (UI may ignore).
        if (!partialEmitted && options.onPartial && chunks.length >= 1) {
          partialEmitted = true;
          options.onPartial({
            text: "Tôi muốn luyện…",
            isFinal: false,
          });
        }
      },
      finalize: async (): Promise<StreamingSttFinal> => {
        if (finalized) {
          throw new Error("FakeStreamingSttSession already finalized");
        }
        finalized = true;
        if (cancelled) {
          throw new Error("FakeStreamingSttSession cancelled");
        }
        const audio = Buffer.concat(chunks);
        const mimeType =
          options.encoding === "segment_m4a"
            ? "audio/mp4"
            : options.encoding === "segment_wav"
              ? "audio/wav"
              : "audio/wav";
        const result = await this.batch.transcribe({
          audio,
          mimeType,
          locale: options.locale,
        });
        return {
          transcript: result.transcript,
          providerName: this.name,
          latencyMs: result.latencyMs ?? Date.now() - started,
        };
      },
      cancel: () => {
        cancelled = true;
        chunks.length = 0;
      },
    };
  }
}
