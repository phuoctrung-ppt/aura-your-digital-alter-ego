/**
 * Speech-to-text provider contract (ADR-0003).
 * Preferred primary: Whisper local/self-hosted (`STT_PROVIDER=whisper-local|whisper-api`).
 * GCP option: Cloud Speech-to-Text (`STT_PROVIDER=gcp` or `STT_FALLBACK_PROVIDER=gcp`).
 */

export type SttRequest = {
  /** Local path or buffer of uploaded turn audio. */
  audio: Buffer | string;
  mimeType: string;
  locale?: string;
  timeoutMs?: number;
};

export type SttResult = {
  transcript: string;
  providerName: string;
  latencyMs?: number;
};

export interface SttProvider {
  readonly name: string;
  transcribe(request: SttRequest): Promise<SttResult>;
}
