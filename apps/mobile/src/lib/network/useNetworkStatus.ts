import { useCallback, useEffect, useState } from "react";
import {
  addNetworkStateListener,
  getNetworkStateAsync,
  type NetworkState,
} from "expo-network";

function deriveOnline(state: NetworkState): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/**
 * Tracks connectivity for empty_network gates (Home / Session start).
 * `isOnline === null` while the first probe is in flight.
 */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await getNetworkStateAsync();
      setIsOnline(deriveOnline(state));
    } catch {
      // Fail open so a flaky Network module does not brick the shell.
      setIsOnline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = addNetworkStateListener((state) => {
      setIsOnline(deriveOnline(state));
    });
    return () => {
      sub.remove();
    };
  }, [refresh]);

  return { isOnline, refresh };
}
