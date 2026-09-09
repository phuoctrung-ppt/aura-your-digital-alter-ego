/**
 * Streaming speech-to-text session API for the Socket.IO voice path (ADR-0005).
 * Batch `SttProvider.transcribe` remains the REST multipart contract.
 */

export type StreamingSttEncoding =
  | "pcm_s16le"
  | "segment_m4a"
  | "segment_wav";

export type StreamingSttPartial = {
  text: string;
  isFinal: false;
};

export type StreamingSttFinal = {
  transcript: string;
  providerName: string;
  latencyMs?: number;
};

export type StreamingSttSessionOptions = {
  locale?: string;
  encoding: StreamingSttEncoding;
  sampleRateHz?: number;
  channels?: number;
  /**
   * Optional callback for interim hypotheses. Providers may emit zero or more.
   * Never log the text at the call site (AGENTS.md §12).
   */
  onPartial?: (partial: StreamingSttPartial) => void;
};

/**
 * One uplink utterance. Push frames while PTT is held; `finalize` closes STT.
 */
export interface StreamingSttSession {
  pushAudio(frame: Buffer): void | Promise<void>;
  finalize(): Promise<StreamingSttFinal>;
  /** Best-effort cancel (socket disconnect / abort). */
  cancel(): void;
}

export interface StreamingSttProvider {
  readonly name: string;
  createSession(options: StreamingSttSessionOptions): StreamingSttSession;
}
