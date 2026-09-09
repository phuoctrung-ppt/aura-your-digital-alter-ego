import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppLogger } from "../../common";
import type {
  ChatProvider,
  ChatRequest,
  ChatResult,
} from "../interfaces/chat-provider";
import { fetchWithTimeout, providerUnavailable } from "../provider-errors";
import {
  getGoogleAuthHeaders,
  resolveGoogleQuotaProject,
} from "./google-adc";

/**
 * Preferred chat fallback — Vertex AI Gemini via OpenAI-compatible endpoint (ADC).
 * Env: `VERTEX_PROJECT_ID` (or `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` /
 * `GOOGLE_CLOUD_QUOTA_PROJECT` / ADC `quota_project_id`),
 * `VERTEX_LOCATION` (default `asia-southeast1`),
 * `VERTEX_CHAT_MODEL` (default `gemini-2.0-flash-001`),
 * optional `LLM_FALLBACK_TIMEOUT_MS`.
 *
 * Auth: Bearer ADC access token — no API key required.
 * Recorded providerName: `fallback-vertex`.
 *
 * Project id must resolve the same way Speech/TTS do via
 * {@link resolveGoogleQuotaProject}; otherwise Ollama failure surfaces as
 * "no fallback is configured" even when ADC quota project is set.
 */
@Injectable()
export class VertexChatProvider implements ChatProvider {
  readonly name = "fallback-vertex";
  private readonly logger = new AppLogger(VertexChatProvider.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.resolveProjectId() && this.resolveLocation() && this.resolveModelId());
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const projectId = this.resolveProjectId();
    const location = this.resolveLocation();
    const modelId = this.resolveModelId();

    if (!projectId || !location || !modelId) {
      throw providerUnavailable(
        "Vertex chat is not configured (VERTEX_PROJECT_ID / VERTEX_LOCATION / VERTEX_CHAT_MODEL)",
      );
    }

    const model =
      request.model?.trim() ||
      (modelId.includes("/") ? modelId : `google/${modelId}`);

    const timeoutMs =
      request.timeoutMs ??
      Number(this.config.get<string>("LLM_FALLBACK_TIMEOUT_MS") ?? 45_000);

    const url =
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
      `/locations/${location}/endpoints/openapi/chat/completions`;

    const started = Date.now();
    let authHeaders: Record<string, string>;
    try {
      authHeaders = await getGoogleAuthHeaders();
    } catch (err) {
      this.logger.warn(
        `vertex.chat adc failed latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(
        `Vertex ADC unavailable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders,
          },
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
        `vertex.chat failed model=${model} latencyMs=${Date.now() - started}`,
      );
      if (err instanceof Error && "getStatus" in err) throw err;
      throw providerUnavailable(
        `Vertex chat unreachable: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }

    if (!response.ok) {
      this.logger.warn(
        `vertex.chat http=${response.status} model=${model} latencyMs=${Date.now() - started}`,
      );
      throw providerUnavailable(`Vertex chat returned HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) {
      throw providerUnavailable("Vertex chat returned empty content");
    }

    const latencyMs = Date.now() - started;
    this.logger.log(`vertex.chat ok model=${model} latencyMs=${latencyMs}`);
    return {
      text,
      providerName: this.name,
      model,
      latencyMs,
    };
  }

  private resolveProjectId(): string | undefined {
    return (
      this.config.get<string>("VERTEX_PROJECT_ID")?.trim() ||
      this.config.get<string>("GCLOUD_PROJECT")?.trim() ||
      this.config.get<string>("GOOGLE_CLOUD_PROJECT")?.trim() ||
      this.config.get<string>("GOOGLE_CLOUD_QUOTA_PROJECT")?.trim() ||
      // Same ADC / quota resolution Speech uses — ConfigService alone misses
      // application_default_credentials.json `quota_project_id`.
      resolveGoogleQuotaProject() ||
      undefined
    );
  }

  private resolveLocation(): string {
    return (
      this.config.get<string>("VERTEX_LOCATION")?.trim() || "asia-southeast1"
    );
  }

  private resolveModelId(): string {
    return (
      this.config.get<string>("VERTEX_CHAT_MODEL")?.trim() ||
      "gemini-2.0-flash-001"
    );
  }
}
