/**
 * Token storage — SecureStore on native (Keychain / Keystore).
 * Web preview uses sessionStorage only so Expo web can hydrate without
 * crashing; that path is NOT a production security boundary.
 * Do NOT use AsyncStorage for tokens (acceptance: encrypted device store).
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export interface TokenStore {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setTokens(tokens: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

const ACCESS_KEY = "aura.accessToken";
const REFRESH_KEY = "aura.refreshToken";

/** Placeholder keys for the SecureStore / web-session implementations / tests. */
export const tokenStoreKeys = {
  access: ACCESS_KEY,
  refresh: REFRESH_KEY,
} as const;

/**
 * In-memory store for unit tests / Storybook-style harnesses.
 * Never ship as the production default.
 */
export class MemoryTokenStore implements TokenStore {
  private access: string | null = null;
  private refresh: string | null = null;

  async getAccessToken(): Promise<string | null> {
    return this.access;
  }

  async getRefreshToken(): Promise<string | null> {
    return this.refresh;
  }

  async setTokens(tokens: TokenPair): Promise<void> {
    this.access = tokens.accessToken;
    this.refresh = tokens.refreshToken;
  }

  async clear(): Promise<void> {
    this.access = null;
    this.refresh = null;
  }
}

/** Production token store — expo-secure-store (Keychain / Keystore). */
export class SecureTokenStore implements TokenStore {
  async getAccessToken(): Promise<string | null> {
    return SecureStore.getItemAsync(tokenStoreKeys.access);
  }

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(tokenStoreKeys.refresh);
  }

  async setTokens(tokens: TokenPair): Promise<void> {
    await SecureStore.setItemAsync(tokenStoreKeys.access, tokens.accessToken);
    await SecureStore.setItemAsync(tokenStoreKeys.refresh, tokens.refreshToken);
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(tokenStoreKeys.access);
    await SecureStore.deleteItemAsync(tokenStoreKeys.refresh);
  }
}

/**
 * Web-preview token store — sessionStorage (tab-scoped).
 * Used only when Platform.OS === "web" so Metro web can run auth UI.
 * Cleared when the tab closes. Not for native or production web shipping.
 */
export class WebSessionTokenStore implements TokenStore {
  private read(key: string): string | null {
    if (typeof sessionStorage === "undefined") {
      return null;
    }
    return sessionStorage.getItem(key);
  }

  private write(key: string, value: string): void {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.setItem(key, value);
  }

  private remove(key: string): void {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.removeItem(key);
  }

  async getAccessToken(): Promise<string | null> {
    return this.read(tokenStoreKeys.access);
  }

  async getRefreshToken(): Promise<string | null> {
    return this.read(tokenStoreKeys.refresh);
  }

  async setTokens(tokens: TokenPair): Promise<void> {
    this.write(tokenStoreKeys.access, tokens.accessToken);
    this.write(tokenStoreKeys.refresh, tokens.refreshToken);
  }

  async clear(): Promise<void> {
    this.remove(tokenStoreKeys.access);
    this.remove(tokenStoreKeys.refresh);
  }
}

function createDefaultTokenStore(): TokenStore {
  if (Platform.OS === "web") {
    return new WebSessionTokenStore();
  }
  return new SecureTokenStore();
}

/** App default — SecureStore on native; sessionStorage on web preview. */
export const tokenStore: TokenStore = createDefaultTokenStore();
