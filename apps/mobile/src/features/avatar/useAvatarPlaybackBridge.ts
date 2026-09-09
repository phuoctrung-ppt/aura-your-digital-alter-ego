import { useEffect, useState } from "react";
import {
  getPlaybackSnapshot,
  subscribePlayback,
} from "../../lib/audio/playback-registry";
import type { UseAvatarPlaybackBridgeResult } from "./types";

type UseAvatarPlaybackBridgeOptions = {
  /** When false, tear down listeners (Session blur / leave). */
  enabled?: boolean;
};

/**
 * Subscribe to chunkPlayer + REST playTurnAudio via playback-registry
 * so lip-sync can observe the active AudioPlayer without importing SessionScreen.
 */
export function useAvatarPlaybackBridge(
  options: UseAvatarPlaybackBridgeOptions = {},
): UseAvatarPlaybackBridgeResult {
  const enabled = options.enabled ?? true;
  const [snapshot, setSnapshot] = useState(getPlaybackSnapshot);

  useEffect(() => {
    if (!enabled) {
      setSnapshot({ player: null, isPlaying: false });
      return;
    }
    return subscribePlayback(setSnapshot);
  }, [enabled]);

  if (!enabled) {
    return { player: null, isPlaying: false };
  }

  return {
    player: snapshot.player,
    isPlaying: snapshot.isPlaying,
  };
}
