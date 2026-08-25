import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import type { AudioPlayer, AudioSample } from "expo-audio";
import type { UseLipSyncResult } from "./types";

type UseLipSyncOptions = {
  /** Active when FSM is talk; player from playback bridge. */
  player?: AudioPlayer | null;
  active?: boolean;
};

const EMA_ALPHA = 0.35;
const SYNTH_TICK_MS = 50;
const REDUCE_MOTION_SCALE = 0.45;

function rmsFromSample(sample: AudioSample): number {
  let sumSquares = 0;
  let count = 0;
  for (const channel of sample.channels) {
    for (const frame of channel.frames) {
      sumSquares += frame * frame;
      count += 1;
    }
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSquares / count);
}

/**
 * RMS jaw from expo-audio sample events, with synthetic envelope fallback
 * when sampling is unsupported. Respects OS reduce-motion amplitude.
 */
export function useLipSync(options: UseLipSyncOptions = {}): UseLipSyncResult {
  const { player = null, active = false } = options;
  const [jawOpen, setJawOpen] = useState(0);
  const emaRef = useRef(0);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) {
        reduceMotionRef.current = enabled;
      }
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        reduceMotionRef.current = enabled;
      },
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let sampleSub: { remove: () => void } | null = null;
    let synthTimer: ReturnType<typeof setInterval> | null = null;
    let rafId: number | null = null;
    let decayActive = false;

    const scaleAmp = (value: number): number => {
      const scaled = reduceMotionRef.current
        ? value * REDUCE_MOTION_SCALE
        : value;
      return Math.max(0, Math.min(1, scaled));
    };

    const pushJaw = (raw: number) => {
      const next = emaRef.current * (1 - EMA_ALPHA) + raw * EMA_ALPHA;
      emaRef.current = next;
      setJawOpen(scaleAmp(next));
    };

    const startDecay = () => {
      if (decayActive) return;
      decayActive = true;
      const tick = () => {
        emaRef.current *= 0.72;
        if (emaRef.current < 0.01) {
          emaRef.current = 0;
          setJawOpen(0);
          decayActive = false;
          rafId = null;
          return;
        }
        setJawOpen(scaleAmp(emaRef.current));
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    };

    if (!active) {
      startDecay();
      return () => {
        if (rafId != null) cancelAnimationFrame(rafId);
      };
    }

    const canSample =
      player != null &&
      typeof player.setAudioSamplingEnabled === "function" &&
      player.isAudioSamplingSupported === true;

    if (canSample && player) {
      try {
        player.setAudioSamplingEnabled(true);
        sampleSub = player.addListener(
          "audioSampleUpdate",
          (sample: AudioSample) => {
            // Gain so conversational TTS levels map into a readable jaw range.
            const rms = Math.min(1, rmsFromSample(sample) * 4.2);
            pushJaw(rms);
          },
        );
      } catch {
        // Fall through to synthetic envelope.
      }
    }

    if (!sampleSub) {
      const startedAt = Date.now();
      synthTimer = setInterval(() => {
        const t = (Date.now() - startedAt) / 1000;
        // Progress envelope + micro-noise while talk is active.
        const envelope =
          0.28 +
          0.22 * Math.sin(t * 9.4) +
          0.12 * Math.sin(t * 17.1 + 0.7) +
          (Math.random() - 0.5) * 0.08;
        pushJaw(Math.max(0.05, Math.min(0.85, envelope)));
      }, SYNTH_TICK_MS);
    }

    return () => {
      if (sampleSub) {
        try {
          sampleSub.remove();
        } catch {
          // ignore
        }
      }
      if (player && canSample) {
        try {
          player.setAudioSamplingEnabled(false);
        } catch {
          // ignore
        }
      }
      if (synthTimer) {
        clearInterval(synthTimer);
      }
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
      emaRef.current = 0;
      setJawOpen(0);
    };
  }, [active, player]);

  return { jawOpen };
}
