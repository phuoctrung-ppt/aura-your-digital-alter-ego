import type { AudioPlayer } from "expo-audio";

export type PlaybackSnapshot = {
  player: AudioPlayer | null;
  isPlaying: boolean;
};

type PlaybackListener = (snapshot: PlaybackSnapshot) => void;

let snapshot: PlaybackSnapshot = {
  player: null,
  isPlaying: false,
};

const listeners = new Set<PlaybackListener>();

function emit(): void {
  for (const listener of listeners) {
    listener(snapshot);
  }
}

/** Publish the active TTS player for lip-sync (chunk queue + REST). */
export function setActivePlayer(
  player: AudioPlayer | null,
  isPlaying = player != null,
): void {
  snapshot = {
    player,
    isPlaying: player != null ? isPlaying : false,
  };
  emit();
}

/** Update playing flag without changing the current player reference. */
export function setPlaying(isPlaying: boolean): void {
  if (snapshot.isPlaying === isPlaying) {
    return;
  }
  snapshot = {
    ...snapshot,
    isPlaying: snapshot.player != null ? isPlaying : false,
  };
  emit();
}

export function getPlaybackSnapshot(): PlaybackSnapshot {
  return snapshot;
}

export function subscribePlayback(listener: PlaybackListener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}
