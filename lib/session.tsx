"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth } from "@/lib/auth";
import type { Account } from "@/lib/auth/types";
import { clearOfflineData, purgePageCache, setOfflineScope } from "@/lib/offline/store";

type SessionState = {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<Account | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

const ACCOUNT_CACHE_KEY = "dolemon:account-cache";

/**
 * The account is restored from the last successful load *before* any network
 * call. That's what makes the app feel instant on the APK: the lock screen,
 * the inbox, the chat — all render immediately, and the real session is
 * verified in the background.
 */
function readCachedAccount(): Account | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(ACCOUNT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function cacheAccount(account: Account | null) {
  try {
    if (typeof window === "undefined") return;
    if (account) window.localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify(account));
    else window.localStorage.removeItem(ACCOUNT_CACHE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  // The server and the first client render must agree. Restore the cached
  // account immediately after hydration while verifying it in the background.
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await auth.getAccount();
      setAccount(next);
      cacheAccount(next);
      // Every offline read is keyed by this id; set it before any screen asks.
      setOfflineScope(next?.id ?? null);
      return next;
    } catch {
      // A network hiccup is not a logout: keep whatever account we have
      // (including the cached one) so the app never flings you out for a
      // dead wifi. A real sign-out resolves to null above, not an error.
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = readCachedAccount();
    if (cached) {
      setAccount(cached);
      setOfflineScope(cached.id);
      setLoading(false);
    }
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    // Unsubscribe this browser before removing its authenticated session.
    if (auth.mode === "supabase") {
      try { const { disablePush } = await import("@/lib/push"); await disablePush(); } catch { /* sign-out must remain available offline */ }
    }
    await auth.signOut();
    setAccount(null);
    cacheAccount(null);
    // The cached inbox, threads and pages belong to the account that just left.
    purgePageCache();
    await clearOfflineData();
  }, []);

  const value = useMemo(
    () => ({ account, loading, refresh, signOut }),
    [account, loading, refresh, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** Where the signed-in user should land right now. */
export function landingFor(account: Account | null): string {
  if (!account) return "/signin";
  return account.profileComplete ? "/app" : "/signup/username";
}
