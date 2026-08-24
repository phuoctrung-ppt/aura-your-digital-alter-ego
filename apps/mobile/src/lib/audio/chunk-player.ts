import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { base64ToArrayBuffer } from "./audio-utils";
import { setActivePlayer, setPlaying } from "./playback-registry";

export interface ChunkPlayerListener {
  onPlaybackFinished?: () => void;
  onChunkStarted?: (seq: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}

class ChunkPlayer {
  private queue: { seq: number; player: AudioPlayer }[] = [];
  private currentPlayer: AudioPlayer | null = null;
  private listeners: ChunkPlayerListener = {};

  /**
   * Replace Session-facing listeners.
   * Playback registry stays independent so lip-sync is not clobbered.
   */
  setListeners(listeners: ChunkPlayerListener) {
    this.listeners = listeners;
  }

  getCurrentPlayer(): AudioPlayer | null {
    return this.currentPlayer;
  }

  /**
   * Add a new TTS chunk to the queue.
   * @param chunk The TTS chunk event from the server.
   */
  async addChunk(chunk: {
    seq: number;
    payloadBase64: string;
    mime: string;
  }) {
    const buffer = base64ToArrayBuffer(chunk.payloadBase64);

    // Create a player for this specific chunk.
    // In a real high-performance app, we'd use a single player and append to a buffer
    // but expo-audio's createAudioPlayer with a URI/Blob is the standard path.
    const blob = new Blob([buffer], { type: chunk.mime });
    const uri = URL.createObjectURL(blob);

    const player = createAudioPlayer({ uri }, { updateInterval: 100 });

    this.queue.push({ seq: chunk.seq, player });

    if (!this.currentPlayer) {
      this.playNext();
    }
  }

  private playNext() {
    if (this.queue.length === 0) {
      this.currentPlayer = null;
      setActivePlayer(null, false);
      this.listeners.onPlayingChange?.(false);
      this.listeners.onPlaybackFinished?.();
      return;
    }

    const { seq, player } = this.queue.shift()!;
    this.currentPlayer = player;
    setActivePlayer(player, true);
    setPlaying(true);
    this.listeners.onPlayingChange?.(true);
    this.listeners.onChunkStarted?.(seq);

    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        sub.remove();
        try {
          player.remove();
        } catch {
          // ignore
        }
        this.playNext();
      }
    });

    try {
      player.play();
    } catch {
      try {
        sub.remove();
      } catch {
        // ignore
      }
      try {
        player.remove();
      } catch {
        // ignore
      }
      this.playNext();
    }
  }

  stop() {
    if (this.currentPlayer) {
      try {
        this.currentPlayer.pause();
      } catch {
        // ignore
      }
      try {
        this.currentPlayer.remove();
      } catch {
        // ignore
      }
    }
    this.queue.forEach((item) => {
      try {
        item.player.remove();
      } catch {
        // ignore
      }
    });
    this.queue = [];
    this.currentPlayer = null;
    setActivePlayer(null, false);
    this.listeners.onPlayingChange?.(false);
  }
}

export const chunkPlayer = new ChunkPlayer();
