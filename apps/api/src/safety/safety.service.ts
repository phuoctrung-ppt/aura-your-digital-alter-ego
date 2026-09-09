import { Injectable } from "@nestjs/common";
import type { SafetyMode, SafetyResource } from "@aura/contracts";
import { AppLogger } from "../common";

export type SafetyCheckInput = {
  userId: string;
  sessionId: string;
  text: string;
};

export type SafetyCheckResult = {
  mode: SafetyMode;
  /** True when self-harm / extreme distress classifiers hit. */
  hit: boolean;
  /** Opaque category for SafetyEvent persistence. */
  category?: string;
};

/**
 * MVP safety policy — small VN+EN keyword/regex heuristic (not ML).
 * On hit: drop persona pressure → safe-listener + VN help resources.
 * Applies identically on Ollama and cloud fallback paths (ADR-0003).
 *
 * Keep the list small and documented. Do not log matched text bodies.
 */
const SELF_HARM_PATTERNS: RegExp[] = [
  // English
  /\bkill\s+my\s*self\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bend\s+my\s+life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bself[-\s]?harm\b/i,
  // Vietnamese (common crisis phrases; not exhaustive)
  /tự\s*sát/i,
  /tu\s*sat/i,
  /muốn\s+chết/i,
  /muon\s+chet/i,
  /kết\s*thúc\s+cuộc\s+đời/i,
  /không\s+muốn\s+sống/i,
  /khong\s+muon\s+song/i,
];

/** Public VN crisis resources shown to the client (placeholders / well-known hotlines). */
export const VN_SAFETY_RESOURCES: SafetyResource[] = [
  {
    title: "Tổng đài tư vấn tâm lý miễn phí",
    value: "18001567",
    kind: "phone",
  },
  {
    title: "Đường dây nóng sức khỏe tâm thần (tham khảo)",
    value: "1900545476",
    kind: "phone",
  },
  {
    title: "Nếu bạn đang gặp nguy hiểm ngay lập tức",
    value: "Hãy gọi cấp cứu 115 hoặc đến cơ sở y tế gần nhất.",
    kind: "text",
  },
];

/** Supportive Vietnamese reply used when safety mode engages (no medical advice). */
export const SAFE_LISTENER_REPLY_VI =
  "Mình nghe bạn rồi. Bạn không cần tiếp tục phần luyện tập lúc này. " +
  "Nếu bạn đang cảm thấy rất khó chịu hoặc nghĩ đến việc làm hại bản thân, " +
  "hãy tìm sự hỗ trợ từ người thân hoặc các đường dây hỗ trợ bên dưới. " +
  "Bạn không cô đơn.";

@Injectable()
export class SafetyService {
  private readonly logger = new AppLogger(SafetyService.name);

  /** Pre-LLM check on user transcript. */
  async checkUserText(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    return this.evaluate(input, "user");
  }

  /** Post-LLM check on assistant reply before TTS. */
  async checkAssistantText(
    input: SafetyCheckInput,
  ): Promise<SafetyCheckResult> {
    return this.evaluate(input, "assistant");
  }

  resources(): SafetyResource[] {
    return VN_SAFETY_RESOURCES;
  }

  safeListenerReply(): string {
    return SAFE_LISTENER_REPLY_VI;
  }

  private evaluate(
    input: SafetyCheckInput,
    stage: "user" | "assistant",
  ): SafetyCheckResult {
    const text = input.text ?? "";
    const hit = SELF_HARM_PATTERNS.some((re) => re.test(text));
    if (hit) {
      this.logger.warn(
        `safety.hit stage=${stage} category=self-harm sessionId=${input.sessionId}`,
      );
      return {
        mode: "safe-listener",
        hit: true,
        category: "self-harm",
      };
    }
    return { mode: "normal", hit: false };
  }
}
