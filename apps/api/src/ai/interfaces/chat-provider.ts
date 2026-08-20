/**
 * Chat LLM provider contract (ADR-0003).
 * Primary: Ollama. Preferred fallback: Vertex AI Gemini (ADC).
 * Optional fallback: OpenAI-compatible HTTP API (`CHAT_FALLBACK_PROVIDER=openai_compatible`).
 *
 * TODO(backend-worker): expand request/result shapes after SP-2 model defaults
 * (`OLLAMA_CHAT_MODEL`, fallback model id) are confirmed.
 */

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  /** Optional model override; providers fall back to env defaults. */
  model?: string;
  /** Soft timeout hint (ms); provider may enforce its own. */
  timeoutMs?: number;
};

export type ChatResult = {
  text: string;
  /** Opaque provider id recorded on Turn (e.g. `ollama`, `fallback-vertex`). */
  providerName: string;
  model: string;
  latencyMs?: number;
};

export interface ChatProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResult>;
  /** Optional — orchestrator uses duck-typing when deciding if fallback is ready. */
  isConfigured?: () => boolean;
}
