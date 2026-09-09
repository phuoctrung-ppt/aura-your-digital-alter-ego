import { io, Socket } from "socket.io-client";
import { getWsBaseUrl } from "../config";
import { tokenStore } from "../session/token-store";
import {
  VOICE_WS_NAMESPACE,
  VoiceWsEvents,
  type VoiceTurnStartEvent,
  type VoiceAudioFrameEvent,
  type VoiceTurnEndEvent,
  type VoiceSttPartialEvent,
  type VoiceSttFinalEvent,
  type VoiceAssistantTextEvent,
  type VoiceTtsChunkEvent,
  type VoiceTurnDoneEvent,
  type VoiceErrorEvent,
} from "@aura/contracts";

export interface VoiceSocketListeners {
  onSttPartial?: (event: VoiceSttPartialEvent) => void;
  onSttFinal?: (event: VoiceSttFinalEvent) => void;
  onAssistantText?: (event: VoiceAssistantTextEvent) => void;
  onTtsChunk?: (event: VoiceTtsChunkEvent) => void;
  onTurnDone?: (event: VoiceTurnDoneEvent) => void;
  onError?: (event: VoiceErrorEvent) => void;
}

class VoiceSocketClient {
  private socket: Socket | null = null;
  private listeners: VoiceSocketListeners = {};

  async connect(listeners: VoiceSocketListeners): Promise<void> {
    if (this.socket?.connected) {
      this.listeners = listeners;
      return;
    }

    this.listeners = listeners;
    const token = await tokenStore.getAccessToken();
    const baseUrl = getWsBaseUrl();

    // Socket.IO namespace is NOT Engine.IO path — join `/v1/voice` after connect.
    this.socket = io(`${baseUrl}${VOICE_WS_NAMESPACE}`, {
      auth: { token },
      transports: ["websocket"],
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on(VoiceWsEvents.SttPartial, (e: VoiceSttPartialEvent) => {
      this.listeners.onSttPartial?.(e);
    });
    this.socket.on(VoiceWsEvents.SttFinal, (e: VoiceSttFinalEvent) => {
      this.listeners.onSttFinal?.(e);
    });
    this.socket.on(VoiceWsEvents.AssistantText, (e: VoiceAssistantTextEvent) => {
      this.listeners.onAssistantText?.(e);
    });
    this.socket.on(VoiceWsEvents.TtsChunk, (e: VoiceTtsChunkEvent) => {
      this.listeners.onTtsChunk?.(e);
    });
    this.socket.on(VoiceWsEvents.TurnDone, (e: VoiceTurnDoneEvent) => {
      this.listeners.onTurnDone?.(e);
    });
    this.socket.on(VoiceWsEvents.Error, (e: VoiceErrorEvent) => {
      this.listeners.onError?.(e);
    });
  }

  startTurn(event: VoiceTurnStartEvent): void {
    this.emit(VoiceWsEvents.TurnStart, event);
  }

  sendFrame(event: VoiceAudioFrameEvent, binaryData?: ArrayBuffer): void {
    if (event.binary && binaryData) {
      // Socket.io supports binary as a separate argument
      this.emit(VoiceWsEvents.AudioFrame, event, binaryData);
    } else {
      this.emit(VoiceWsEvents.AudioFrame, event);
    }
  }

  endTurn(event: VoiceTurnEndEvent): void {
    this.emit(VoiceWsEvents.TurnEnd, event);
  }

  private emit(event: string, ...args: any[]): void {
    if (!this.socket) {
      throw new Error("VoiceSocket not connected");
    }
    this.socket.emit(event, ...args);
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const voiceSocket = new VoiceSocketClient();
