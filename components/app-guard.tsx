"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
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
    // A still splash, not a spinner: the shell already shows the launcher icon
    // while the page paints, and a spinning loader in the middle of the screen
    // is the single biggest "this is a website" tell.
    return (
      <main aria-busy="true" aria-label="Dolemon" className="flex min-h-dvh items-center justify-center bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png?v=2" alt="" width={64} height={64} className="h-16 w-16 rounded-[18px] opacity-90" />
      </main>
    );
  }

  return <>{children}</>;
}
