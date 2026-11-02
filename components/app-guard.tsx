"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSession, landingFor } from "@/lib/session";
import { isUnlocked } from "@/lib/app-lock";

export function AppGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { account, loading } = useSession();

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

  if (loading || !account || !account.profileComplete) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" aria-label="Loading" />
      </main>
    );
  }

  return <>{children}</>;
}
