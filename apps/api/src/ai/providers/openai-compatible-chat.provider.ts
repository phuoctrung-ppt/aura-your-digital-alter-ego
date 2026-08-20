import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLogger } from "../../common";
import type {
  ChatProvider,
  ChatRequest,
  ChatResult,
} from "../interfaces/chat-provider";
import { fetchWithTimeout, providerUnavailable } from "../provider-errors";

/**
 * Fallback chat provider — OpenAI-compatible HTTP API (ADR-0003).
 * Env: `LLM_FALLBACK_BASE_URL`, `LLM_FALLBACK_API_KEY`, `LLM_FALLBACK_CHAT_MODEL`.
 * Used only when primary fails — never silent (orchestrator logs the switch).
 *
 * Assumes OpenAI Chat Completions shape:
 * POST `{base}/v1/chat/completions` with Bearer auth.
 * If `LLM_FALLBACK_BASE_URL` already ends with `/v1`, we append `/chat/completions` only.
 */
@Injectable()
export class OpenAiCompatibleChatProvider implements ChatProvider {
  readonly name = "openai-compatible";
  private readonly logger = new AppLogger(OpenAiCompatibleChatProvider.name);

  constructor(private readonly config: ConfigService) {}

  /** True when fallback base URL + model are present (API key optional for local proxies). */
  isConfigured(): boolean {
    const base = this.config.get<string>("LLM_FALLBACK_BASE_URL")?.trim();
    const model = this.config.get<string>("LLM_FALLBACK_CHAT_MODEL")?.trim();
    return Boolean(base && model);
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const baseUrl = this.config.get<string>("LLM_FALLBACK_BASE_URL")?.trim();
    const apiKey = this.config.get<string>("LLM_FALLBACK_API_KEY")?.trim();
    const model =
      request.model?.trim() ||
      this.config.get<string>("LLM_FALLBACK_CHAT_MODEL")?.trim();

    if (!baseUrl || !model) {
      throw providerUnavailable(
        "OpenAI-compatible fallback is not configured (LLM_FALLBACK_BASE_URL / LLM_FALLBACK_CHAT_MODEL)",
      );
    }

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("LLM_FALLBACK_TIMEOUT_MS") ?? 45_000);

    const url = this.completionsUrl(baseUrl);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const started = Date.now();
    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            messages: request.messages,
            stream: false,
          }),
        },
        Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 45_000,
      );
    } catch (err) {
      this.logger.warn(
        `openai-compatible.chat failed model=${model} latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `Fallback chat unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `openai-compatible.chat http=${response.status} model=${model} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(
        `Fallback chat returned HTTP ${response.status}`,
      );
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw providerUnavailable("Fallback chat returned empty content");
    }

    const latencyMs = Date.now() - started;
    this.logger.log(
      `openai-compatible.chat ok model=${model} latencyMs=${latencyMs}`,
    );
    return {
      text,
      providerName: this.name,
      model,
      latencyMs,
    };
  }

  private completionsUrl(baseUrl: string): string {
    const trimmed = baseUrl.replace(/\/$/, "");
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/chat/completions`;
    }
    if (trimmed.endsWith("/chat/completions")) {
      return trimmed;
    }
    return `${trimmed}/v1/chat/completions`;
  }
}
