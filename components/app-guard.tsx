"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSession, landingFor } from "@/lib/session";
import { autoLockMs, clearUnlocked, isUnlocked } from "@/lib/app-lock";
import { usePrefs } from "@/lib/prefs";

/**
 * Every private screen sits behind this.
 *
 * The lock wall appears exactly when the app is *opened*: there is no
 * "unlocked" record in this browser session yet (a fresh tab / relaunch).
 * A refresh keeps the same session storage, and moving between pages never
 * re-asks — the wall would feel like a bug, not a lock.
 *
 * The only re-lock while the app is open is the honest one: you left the app
 * (tab hidden) for longer than the chosen auto-lock window, and you come back.
 */
export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { account, loading } = useSession();
  const { autoLock } = usePrefs();

  const locked = Boolean(account?.hasAppLock) && !isUnlocked(account?.id ?? "");

  useEffect(() => {
    if (loading) return;
    if (!account) {
      router.replace("/signin");
      return;
    }
    if (!account.profileComplete) {
      router.replace(landingFor(account));
      return;
    }
    if (account.hasAppLock && !isUnlocked(account.id)) {
      router.replace("/unlock");
    }
  }, [account, loading, router]);

  // coming back from the home screen / another app after being away too long
  useEffect(() => {
    if (!account?.hasAppLock) return;
    const timeout = autoLockMs(autoLock);
    let hiddenAt = 0;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= timeout) {
        clearUnlocked();
        router.replace("/unlock");
      }
      hiddenAt = 0;
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [account?.hasAppLock, account?.id, autoLock, router]);

  if (loading || !account || !account.profileComplete || locked) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-label="Loading" />
      </main>
    );
  }

  return <>{children}</>;
}
