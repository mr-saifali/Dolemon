"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSession, landingFor } from "@/lib/session";
import { autoLockMs, clearUnlocked, isUnlockedWithin } from "@/lib/app-lock";
import { usePrefs } from "@/lib/prefs";

/**
 * Every private screen sits behind this. It also enforces the app-lock window:
 * leave Dolemon for longer than the chosen delay and you come back to the wall.
 */
export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { account, loading } = useSession();
  const { autoLock } = usePrefs();

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
    if (account.hasAppLock && !isUnlockedWithin(account.id, autoLockMs(autoLock))) {
      router.replace("/unlock");
    }
  }, [account, loading, router, autoLock]);

  // coming back from the home screen / another app
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

  if (loading || !account || !account.profileComplete) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-label="Loading" />
      </main>
    );
  }

  if (account.hasAppLock && !isUnlockedWithin(account.id, autoLockMs(autoLock))) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-label="Locked" />
      </main>
    );
  }

  return <>{children}</>;
}
