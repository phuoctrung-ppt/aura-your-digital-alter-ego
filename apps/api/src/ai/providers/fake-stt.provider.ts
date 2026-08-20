import { Injectable } from "@nestjs/common";
import type { SttProvider, SttRequest, SttResult } from "../interfaces/stt-provider";

/**
 * Deterministic STT fake for smoke/tests (`AI_PROVIDER_MODE=fake` / `STT_PROVIDER=fake`).
 * Returns a fixed Vietnamese fixture transcript — never logs audio.
 */
@Injectable()
export class FakeSttProvider implements SttProvider {
  readonly name = "fake-stt";

  async transcribe(_request: SttRequest): Promise<SttResult> {
    const started = Date.now();
    return {
      transcript: "Tôi muốn luyện phỏng vấn cho vị trí kỹ sư phần mềm tại công ty Aura.",
      providerName: this.name,
      latencyMs: Date.now() - started,
    };
  }
}
