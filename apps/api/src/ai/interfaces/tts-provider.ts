import type { VoiceDTO } from '@aura/contracts';

/**
 * Text-to-speech provider contract (ADR-0003).
 * Primary: local / silent via `TTS_PROVIDER` / `TTS_BASE_URL`.
 * GCP option: Cloud Text-to-Speech (`TTS_PROVIDER=gcp` or `TTS_FALLBACK_PROVIDER=gcp`).
 */

export type TtsRequest = {
  text: string;
  locale?: string;
  /** Optional voice id / persona voice key. */
  voice?: string;
  timeoutMs?: number;
};

export type TtsResult = {
  /** Stored audio URI or absolute path (serving path is API concern). */
  audioUri: string;
  providerName: string;
  mimeType?: string;
  latencyMs?: number;
};

export interface TtsProvider {
  readonly name: string;
  synthesize(request: TtsRequest): Promise<TtsResult>;
  listVoices(locale: string): Promise<VoiceDTO[]>;
}
