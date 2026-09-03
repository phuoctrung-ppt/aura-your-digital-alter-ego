/**
 * Appearance preference persistence (non-secure prefs).
 * Design Contract: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: docs/design/2026-08-28-aura-mobile-ui-v3.spec.md
 * DESIGN-GATE: asset-pack N/A — product chrome
 *
 * Modes: system | light | dark. Default = system.
 * Uses expo-file-system/legacy on native (AsyncStorage not in deps);
 * localStorage on web preview. NOT SecureStore — prefs ≠ tokens.
 */

import { Platform } from "react-native";
import {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedColorScheme = "light" | "dark";

const STORAGE_KEY = "aura.appearance";
const DEFAULT_APPEARANCE: AppearancePreference = "system";

const APPEARANCE_VALUES: readonly AppearancePreference[] = [
  "system",
  "light",
  "dark",
] as const;

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return (
    typeof value === "string" &&
    (APPEARANCE_VALUES as readonly string[]).includes(value)
  );
}

function prefsFileUri(): string | null {
  if (!documentDirectory) return null;
  return `${documentDirectory}${STORAGE_KEY}.json`;
}

function readWeb(): AppearancePreference | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isAppearancePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeWeb(value: AppearancePreference): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore quota / private-mode failures
  }
}

async function readNative(): Promise<AppearancePreference | null> {
  const uri = prefsFileUri();
  if (!uri) return null;
  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await readAsStringAsync(uri);
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "appearance" in parsed &&
      isAppearancePreference((parsed as { appearance: unknown }).appearance)
    ) {
      return (parsed as { appearance: AppearancePreference }).appearance;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeNative(value: AppearancePreference): Promise<void> {
  const uri = prefsFileUri();
  if (!uri) return;
  try {
    await writeAsStringAsync(uri, JSON.stringify({ appearance: value }));
  } catch {
    // best-effort prefs — ignore IO failures
  }
}

export interface AppearanceStore {
  get(): Promise<AppearancePreference>;
  set(value: AppearancePreference): Promise<void>;
}

/**
 * In-memory store for tests / Storybook harnesses.
 */
export class MemoryAppearanceStore implements AppearanceStore {
  private value: AppearancePreference = DEFAULT_APPEARANCE;

  async get(): Promise<AppearancePreference> {
    return this.value;
  }

  async set(value: AppearancePreference): Promise<void> {
    if (!isAppearancePreference(value)) return;
    this.value = value;
  }
}

/**
 * App default — file prefs on native; localStorage on web preview.
 */
export class FileAppearanceStore implements AppearanceStore {
  async get(): Promise<AppearancePreference> {
    if (Platform.OS === "web") {
      return readWeb() ?? DEFAULT_APPEARANCE;
    }
    return (await readNative()) ?? DEFAULT_APPEARANCE;
  }

  async set(value: AppearancePreference): Promise<void> {
    if (!isAppearancePreference(value)) return;
    if (Platform.OS === "web") {
      writeWeb(value);
      return;
    }
    await writeNative(value);
  }
}

/** Shared singleton for the app. */
export const appearanceStore: AppearanceStore = new FileAppearanceStore();

export const appearanceStoreKeys = {
  preference: STORAGE_KEY,
  default: DEFAULT_APPEARANCE,
} as const;

/**
 * Resolve preference against an OS scheme.
 * `system` → OS; otherwise force light/dark.
 */
export function resolveAppearance(
  preference: AppearancePreference,
  systemScheme: ResolvedColorScheme | null | undefined,
): ResolvedColorScheme {
  if (preference === "light" || preference === "dark") {
    return preference;
  }
  return systemScheme === "light" ? "light" : "dark";
}
