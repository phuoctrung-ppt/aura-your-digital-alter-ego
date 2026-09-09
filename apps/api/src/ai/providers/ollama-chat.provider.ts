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
 * Primary chat provider — Ollama local (ADR-0003).
 * Env: `OLLAMA_BASE_URL`, `OLLAMA_CHAT_MODEL` (default `llama3.2` outside prod when unset).
 * POST `{OLLAMA_BASE_URL}/api/chat` with `{ model, messages, stream:false }`.
 */
@Injectable()
export class OllamaChatProvider implements ChatProvider {
  readonly name = "ollama";
  private readonly logger = new AppLogger(OllamaChatProvider.name);

  constructor(private readonly config: ConfigService) {}

  async chat(request: ChatRequest): Promise<ChatResult> {
    const baseUrl = this.config.get<string>("OLLAMA_BASE_URL")?.trim();
    if (!baseUrl) {
      throw providerUnavailable("OLLAMA_BASE_URL is not configured");
    }

    const model =
      request.model?.trim() ||
      this.config.get<string>("OLLAMA_CHAT_MODEL")?.trim() ||
      this.defaultModel();

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("OLLAMA_CHAT_TIMEOUT_MS") ?? 45_000);

    const url = `${baseUrl.replace(/\/$/, "")}/api/chat`;
    const started = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        `ollama.chat failed model=${model} latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `Ollama unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `ollama.chat http=${response.status} model=${model} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(`Ollama returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      message?: { content?: string };
      response?: string;
    };
    const text =
      body.message?.content?.trim() ||
      (typeof body.response === "string" ? body.response.trim() : "");
    if (!text) {
      throw providerUnavailable("Ollama returned empty chat content");
    }

    const latencyMs = Date.now() - started;
    this.logger.log(
      `ollama.chat ok model=${model} latencyMs=${latencyMs}`,
    );
    return {
      text,
      providerName: this.name,
      model,
      latencyMs,
    };
  }

  private defaultModel(): string {
    const env = (this.config.get<string>("NODE_ENV") ?? "development").trim();
    if (env === "production") {
      throw providerUnavailable("OLLAMA_CHAT_MODEL is required in production");
    }
    // SP-2 model lock recommended-only — sensible local default for non-prod.
    return "llama3.2";
  }
}
