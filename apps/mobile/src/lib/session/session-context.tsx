import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { User } from "@aura/contracts";
import { apiClient, setOnUnauthorized } from "../api/client";
import { authApi } from "../api/auth-api";
import { tokenStore, type TokenPair, type TokenStore } from "./token-store";

type SessionState = {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
};

type SessionContextValue = SessionState & {
  hydrate: () => Promise<void>;
  setSession: (user: User, tokens: TokenPair) => Promise<void>;
  clearSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type SessionProviderProps = PropsWithChildren<{
  store?: TokenStore;
  /** When false, caller must invoke hydrate() (tests). Default true. */
  autoHydrate?: boolean;
}>;

/**
 * Session React context — hydrates from TokenStore (SecureStore on native;
 * sessionStorage web preview), wires 401 → clear.
 */
export function SessionProvider({
  children,
  store = tokenStore,
  autoHydrate = true,
}: SessionProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isHydrating, setIsHydrating] = useState(autoHydrate);
  const storeRef = useRef(store);
  storeRef.current = store;
  const clearingRef = useRef(false);

  const clearSession = useCallback(async () => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    try {
      await storeRef.current.clear();
      setUser(null);
    } finally {
      clearingRef.current = false;
    }
  }, []);

  const setSession = useCallback(
    async (nextUser: User, tokens: TokenPair) => {
      await storeRef.current.setTokens(tokens);
      setUser(nextUser);
    },
    [],
  );

  const hydrate = useCallback(async () => {
    setIsHydrating(true);
    try {
      const access = await storeRef.current.getAccessToken();
      const refresh = await storeRef.current.getRefreshToken();

      if (!access && !refresh) {
        setUser(null);
        return;
      }

      try {
        const me = await authApi.me();
        setUser(me);
        return;
      } catch {
        // Fall through to refresh when access is stale / missing.
      }

      if (!refresh) {
        await storeRef.current.clear();
        setUser(null);
        return;
      }

      try {
        const refreshed = await authApi.refresh({ refreshToken: refresh });
        await storeRef.current.setTokens({
          accessToken: refreshed.data.tokens.accessToken,
          refreshToken: refreshed.data.tokens.refreshToken,
        });
        const me = await authApi.me();
        setUser(me);
      } catch {
        await storeRef.current.clear();
        setUser(null);
      }
    } finally {
      setIsHydrating(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login({ email, password });
      await setSession(res.data.user, {
        accessToken: res.data.tokens.accessToken,
        refreshToken: res.data.tokens.refreshToken,
      });
    },
    [setSession],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.register({ email, password, locale: "vi" });
      await setSession(res.data.user, {
        accessToken: res.data.tokens.accessToken,
        refreshToken: res.data.tokens.refreshToken,
      });
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    const refreshToken = await storeRef.current.getRefreshToken();
    try {
      await authApi.logout(
        refreshToken ? { refreshToken } : {},
      );
    } catch {
      // Local clear still required even if network logout fails.
    }
    await clearSession();
  }, [clearSession]);

  // Bind API client token accessors + 401 handler.
  useEffect(() => {
    apiClient.configure({
      getAccessToken: () => storeRef.current.getAccessToken(),
      getRefreshToken: () => storeRef.current.getRefreshToken(),
      setTokens: (tokens) => storeRef.current.setTokens(tokens),
      onUnauthorized: () => clearSession(),
    });
    setOnUnauthorized(() => clearSession());
    return () => {
      setOnUnauthorized(null);
    };
  }, [clearSession]);

  useEffect(() => {
    if (autoHydrate) {
      void hydrate();
    }
  }, [autoHydrate, hydrate]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isHydrating,
      hydrate,
      setSession,
      clearSession,
      login,
      register,
      logout,
    }),
    [
      user,
      isHydrating,
      hydrate,
      setSession,
      clearSession,
      login,
      register,
      logout,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
