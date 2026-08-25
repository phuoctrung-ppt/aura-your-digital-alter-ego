import { Injectable } from "@nestjs/common";
import type { SttProvider, SttRequest, SttResult } from "../interfaces/stt-provider";

const DEFAULT_FAKE_TRANSCRIPT =
  "Tôi muốn luyện phỏng vấn cho vị trí kỹ sư phần mềm tại công ty Aura.";

/**
 * Deterministic STT fake for smoke/tests (`AI_PROVIDER_MODE=fake` / `STT_PROVIDER=fake`).
 * Returns a fixed Vietnamese fixture transcript — never logs audio or transcript body.
 *
 * Optional override: `FAKE_STT_TRANSCRIPT` (trimmed). When non-empty, that string is
 * returned instead of the default interview fixture (M10 safety smoke).
 */
@Injectable()
export class FakeSttProvider implements SttProvider {
  readonly name = "fake-stt";

  async transcribe(_request: SttRequest): Promise<SttResult> {
    const started = Date.now();
    const override = process.env.FAKE_STT_TRANSCRIPT?.trim();
    const transcript =
      override && override.length > 0 ? override : DEFAULT_FAKE_TRANSCRIPT;
    return {
      transcript,
      providerName: this.name,
      latencyMs: Date.now() - started,
    };
  }
}
