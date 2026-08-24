import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { base64ToArrayBuffer } from "./audio-utils"; // Assuming we'll need this helper

export interface ChunkPlayerListener {
  onPlaybackFinished?: () => void;
  onChunkStarted?: (seq: number) => void;
  // RMS data for lip-sync can be hooked via the AudioPlayer's own status or a specific listener
}

class ChunkPlayer {
  private queue: { seq: number; player: AudioPlayer }[] = [];
  private currentPlayer: AudioPlayer | null = null;
  private listeners: ChunkPlayerListener = {};

  setListeners(listeners: ChunkPlayerListener) {
    this.listeners = listeners;
  }

  /**
   * Add a new TTS chunk to the queue.
   * @param chunk The TTS chunk event from the server.
   */
  async addChunk(chunk: { seq: number; payloadBase64: string; mime: string }) {
    const buffer = base64ToArrayBuffer(chunk.payloadBase64);

    // Create a player for this specific chunk.
    // In a real high-performance app, we'd use a single player and append to a buffer
    // but expo-audio's createAudioPlayer with a URI/Blob is the standard path.
    // We use a blob URL for the buffer.
    const blob = new Blob([buffer], { type: chunk.mime });
    const uri = URL.createObjectURL(blob);

    const player = createAudioPlayer({ uri }, { updateInterval: 100 });

    this.queue.push({ seq: chunk.seq, player });

    if (!this.currentPlayer) {
      this.playNext();
    }
  }

  private async playNext() {
    if (this.queue.length === 0) {
      this.currentPlayer = null;
      this.listeners.onPlaybackFinished?.();
      return;
    }

    const { seq, player } = this.queue.shift()!;
    this.currentPlayer = player;

    this.listeners.onChunkStarted?.(seq);

    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        sub.remove();
        player.remove();
        this.playNext();
      }
    });

    try {
      player.play();
    } catch (e) {
      console.error("Chunk playback error", e);
      sub.remove();
      player.remove();
      this.playNext();
    }
  }

  stop() {
    if (this.currentPlayer) {
      this.currentPlayer.pause();
      this.currentPlayer.remove();
    }
    this.queue.forEach(item => item.player.remove());
    this.queue = [];
    this.currentPlayer = null;
  }
}

export const chunkPlayer = new ChunkPlayer();
