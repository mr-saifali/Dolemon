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

type SessionState = {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<Account | null>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await auth.getAccount();
      setAccount(next);
      return next;
    } catch {
      setAccount(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await auth.signOut();
    setAccount(null);
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
  if (!account) return "/";
  return account.profileComplete ? "/app" : "/signup/username";
}
