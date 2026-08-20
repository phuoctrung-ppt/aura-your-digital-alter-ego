import { Injectable } from "@nestjs/common";
import type {
  ChatProvider,
  ChatRequest,
  ChatResult,
} from "../interfaces/chat-provider";

/**
 * Deterministic chat fake for smoke/tests (`AI_PROVIDER_MODE=fake`).
 * Never logs message bodies (AGENTS.md §6 / §12).
 */
@Injectable()
export class FakeChatProvider implements ChatProvider {
  readonly name = "fake-chat";

  async chat(_request: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    return {
      text: "Xin chào! Đây là phản hồi giả lập từ Aura để kiểm tra vòng thoại.",
      providerName: this.name,
      model: "fake-chat-v1",
      latencyMs: Date.now() - started,
    };
  }
}
