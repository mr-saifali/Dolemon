"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { autoLockMs, isUnlockedWithin, markUnlocked } from "@/lib/app-lock";
import { usePrefs } from "@/lib/prefs";

export default function UnlockPage() {
  const router = useRouter();
  const { account, loading, signOut } = useSession();
  const { autoLock } = usePrefs();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!account) {
      router.replace("/signin");
      return;
    }
    if (!account.hasAppLock || isUnlockedWithin(account.id, autoLockMs(autoLock))) router.replace("/app");
  }, [account, loading, router, autoLock]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await auth.verifyAppLock(password);
      if (!ok) {
        setError("That's not it. Try again.");
        setPassword("");
        setSubmitting(false);
        return;
      }
      markUnlocked(account.id);
      router.replace("/app");
    } catch {
      setError("Couldn't check that. Try again?");
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell
      footer={
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
          className="mx-auto block text-[12.5px] text-text-muted underline-offset-4 hover:text-text hover:underline"
        >
          Not you? Sign out
        </button>
      }
    >
      <form onSubmit={submit} className="flex flex-1 flex-col justify-center" noValidate>
        <Motif icon={<Lock className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>Locked for you.</ScreenTitle>
        <ScreenSubtitle>
          Enter your app password to open Dolemon{account?.username ? `, @${account.username}` : ""}.
        </ScreenSubtitle>

        <div className="mt-8">
          <Label htmlFor="app-lock">App password</Label>
          <Input
            id="app-lock"
            type="password"
            autoComplete="current-password"
            placeholder="Your app password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            invalid={Boolean(error)}
          />
          <FieldError message={error ?? undefined} />
        </div>

        <Button type="submit" size="lg" className="mt-7 w-full" loading={submitting} disabled={!password}>
          Unlock
        </Button>
      </form>
    </ScreenShell>
  );
}
