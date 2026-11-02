"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft, Lock, LogOut, MessageSquare as ChatBubble, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { BrandBlob } from "@/components/brand-blob";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { markUnlocked } from "@/lib/app-lock";
import { AVATAR_PRESETS, avatarById } from "@/lib/avatars";
import { passwordStrength } from "@/lib/password";
import { useSession } from "@/lib/session";
import { setPref, usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

function SettingsContent() {
  const router = useRouter();
  const { account, refresh, signOut } = useSession();
  const [lockPassword, setLockPassword] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [savingLock, setSavingLock] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const prefs = usePrefs();

  const avatar = avatarById(account?.avatarId);
  const strength = passwordStrength(lockPassword);

  const saveAvatar = async (avatarId: string | null) => {
    if (!account?.username) return;
    setSavingAvatar(true);
    try {
      await auth.saveProfile({ username: account.username, avatarId });
      await refresh();
    } catch {
      toast.error("Couldn't update your avatar.");
    } finally {
      setSavingAvatar(false);
    }
  };

  const saveLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockPassword.length < 4) {
      setLockError("Use at least 4 characters.");
      return;
    }
    setSavingLock(true);
    setLockError(null);
    try {
      await auth.setAppLock(lockPassword);
      await refresh();
      // Keep this session open; the lock applies the next time the app is opened.
      if (account) markUnlocked(account.id);
      setLockPassword("");
      toast.success("App password saved", { description: "You'll be asked for it next time you open Dolemon." });
    } catch {
      setLockError("Couldn't save that. Try again?");
    } finally {
      setSavingLock(false);
    }
  };

  const removeLock = async () => {
    setSavingLock(true);
    try {
      await auth.setAppLock(null);
      await refresh();
      toast.success("App password removed");
    } catch {
      toast.error("Couldn't remove that.");
    } finally {
      setSavingLock(false);
    }
  };

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-ink">
      <BrandBlob />
      <div className="relative z-10 mx-auto w-full max-w-md px-6 pb-16 safe-t">
        <header className="flex items-center gap-2 pb-6 pt-5">
          <Link
            href="/app"
            aria-label="Back to chat"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.05] hover:text-text"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Settings</h1>
        </header>

        <section className="rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full text-xl"
              style={{
                backgroundColor: avatar?.bg ?? "rgba(255,92,122,0.16)",
                boxShadow: `0 0 0 1px ${(avatar?.ring ?? "#FF5C7A")}33`,
              }}
            >
              {avatar?.emoji ?? "💬"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">@{account?.username ?? "—"}</p>
              <p className="truncate text-[12.5px] text-text-muted">{account?.email}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 text-[12.5px] text-text-muted">Avatar</p>
            <div className="grid grid-cols-8 gap-1.5">
              {AVATAR_PRESETS.map((preset) => {
                const selected = account?.avatarId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={savingAvatar}
                    onClick={() => void saveAvatar(selected ? null : preset.id)}
                    aria-pressed={selected}
                    aria-label={`Avatar ${preset.id}`}
                    className={cn(
                      "relative flex h-9 items-center justify-center rounded-lg border text-base transition-all active:scale-95",
                      selected ? "border-rose/60" : "border-ink-line hover:border-white/20"
                    )}
                    style={{ backgroundColor: selected ? preset.bg : "rgba(26,26,31,0.8)" }}
                  >
                    {preset.emoji}
                    {selected && (
                      <span className="absolute -right-1 -top-1">
                        <Check className="h-3 w-3 rounded-full bg-rose p-[1px] text-[#1A0A0F]" strokeWidth={3.5} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose/15 text-rose">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[14px] font-medium">App password</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">
                A second lock for when you hand someone your phone. Set it after you&apos;re signed
                in — you can change or remove it here any time.
              </p>
            </div>
          </div>

          <form onSubmit={saveLock} className="mt-4">
            <Label htmlFor="app-lock">
              {account?.hasAppLock ? "Change app password" : "Set app password"}
            </Label>
            <Input
              id="app-lock"
              type="password"
              autoComplete="new-password"
              placeholder="At least 4 characters"
              value={lockPassword}
              onChange={(e) => {
                setLockPassword(e.target.value);
                setLockError(null);
              }}
              invalid={Boolean(lockError)}
            />
            <FieldError message={lockError ?? undefined} />
            {lockPassword && (
              <p className="mt-2 text-[12px]" style={{ color: strength.color }}>
                {strength.label || "Keep going"}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <Button type="submit" size="sm" loading={savingLock} className="flex-1">
                {account?.hasAppLock ? "Update" : "Set password"}
              </Button>
              {account?.hasAppLock && (
                <Button type="button" variant="outline" size="sm" onClick={removeLock} disabled={savingLock}>
                  Remove
                </Button>
              )}
            </div>
          </form>

          {account?.hasAppLock && (
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-success">
              <ShieldCheck className="h-3.5 w-3.5" />
              App password is on
            </p>
          )}
        </section>

        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose/15 text-rose">
              <Users className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-medium">Presence</p>
              <p className="text-[11.5px] text-text-muted">How the two of you share the same room.</p>
            </div>
          </div>

          <div className="space-y-4">
            <Switch
              label="Show when I'm here"
              description="Turn this off and the room reads you as away, even when you're inside."
              checked={prefs.showPresence}
              onChange={(v) => setPref("showPresence", v)}
            />
            <div className="h-px bg-white/[0.05]" />
            <Switch
              label="Allow pulses"
              description="The little “thinking of you” that isn't a message. Turn off to stop them entirely."
              checked={prefs.allowPulses}
              onChange={(v) => setPref("allowPulses", v)}
            />
          </div>
        </section>

        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose/15 text-rose">
              <ChatBubble className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[13.5px] font-medium">Chats &amp; privacy</p>
              <p className="text-[11.5px] text-text-muted">What the other person gets to see.</p>
            </div>
          </div>

          <div className="space-y-4">
            <Switch
              label="Read receipts"
              description="Turn off and you won't see theirs either — it works both ways."
              checked={prefs.readReceipts}
              onChange={(v) => setPref("readReceipts", v)}
            />
            <div className="h-px bg-white/[0.05]" />
            <Switch
              label="Typing indicator"
              description="Show “typing…” while you write. Off means off for both of you."
              checked={prefs.typingIndicator}
              onChange={(v) => setPref("typingIndicator", v)}
            />
            <div className="h-px bg-white/[0.05]" />
            <Switch
              label="Haptics"
              description="A small buzz when a pulse or call arrives."
              checked={prefs.haptics}
              onChange={(v) => setPref("haptics", v)}
            />
          </div>
        </section>

        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <p className="text-[13.5px] font-medium">Private by design</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-text-muted">
            Dolemon only ever connects two people. No groups, no discovery, no public profiles.
          </p>
        </section>

        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-danger/25 bg-danger/10 py-3 text-[14px] font-medium text-danger transition-colors hover:bg-danger/15"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>

        <p className="mt-6 text-center text-[11px] text-text-muted/60">Dolemon · v0.1</p>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <AppGuard>
      <SettingsContent />
    </AppGuard>
  );
}
