"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronLeft, Lock } from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-1 px-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-600">
        {title}
      </h2>
      <div className="divide-y divide-white/[0.05]">{children}</div>
    </section>
  );
}

function SettingsContent() {
  const router = useRouter();
  const { account, refresh, signOut } = useSession();
  const [lockOpen, setLockOpen] = useState(false);
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
      setLockError("At least 4 characters.");
      return;
    }
    setSavingLock(true);
    setLockError(null);
    try {
      await auth.setAppLock(lockPassword);
      await refresh();
      if (account) markUnlocked(account.id);
      setLockPassword("");
      setLockOpen(false);
      toast.success("App password saved");
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
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#09090B]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-32 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.12),transparent_70%)] blur-3xl"
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-6 pb-20 safe-t">
        <header className="flex items-center gap-1 pb-2 pt-4">
          <Link
            href="/app"
            aria-label="Back to chats"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-[15px] font-medium text-zinc-300">Settings</h1>
        </header>

        {/* profile */}
        <div className="mt-3 flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
            style={{
              background: avatar
                ? `radial-gradient(120% 120% at 20% 0%, ${avatar.bg} 0%, rgba(24,24,27,1) 100%)`
                : "rgba(255,92,122,0.12)",
              boxShadow: `inset 0 0 0 1px ${(avatar?.ring ?? "#FF5C7A")}22`,
            }}
          >
            {avatar?.emoji ?? "🌙"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[19px] font-light tracking-[-0.01em] text-zinc-100">
              @{account?.username ?? "you"}
            </p>
            <p className="truncate text-[12px] text-zinc-500">{account?.email}</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-8 gap-1.5">
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
                  "relative flex h-9 items-center justify-center rounded-xl text-base transition-all active:scale-95",
                  selected ? "ring-1 ring-rose/70" : "hover:bg-white/[0.04]"
                )}
                style={{ backgroundColor: selected ? preset.bg : "rgba(255,255,255,0.03)" }}
              >
                {preset.emoji}
                {selected && (
                  <span className="absolute -right-1 -top-1">
                    <Check className="h-3 w-3 rounded-full bg-rose p-[1px] text-[#09090B]" strokeWidth={3.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Section title="Privacy">
          <div className="py-3">
            <button
              type="button"
              onClick={() => setLockOpen((o) => !o)}
              aria-expanded={lockOpen}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div>
                <p className="text-[14.5px] text-zinc-200">App lock</p>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">
                  {account?.hasAppLock ? "On — asked every time Dolemon opens." : "A second lock for your phone."}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-zinc-600 transition-transform",
                  lockOpen && "rotate-180"
                )}
              />
            </button>

            <AnimatePresence initial={false}>
              {lockOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <form onSubmit={saveLock} className="pt-3">
                    <Label htmlFor="app-lock">
                      {account?.hasAppLock ? "Change password" : "Set password"}
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={removeLock}
                          disabled={savingLock}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="py-3.5">
            <Switch
              label="Read receipts"
              description="Let them know you've seen it."
              checked={prefs.readReceipts}
              onChange={(v) => setPref("readReceipts", v)}
            />
          </div>

          <div className="py-3.5">
            <Switch
              label="Typing"
              description="Show the dots while you write."
              checked={prefs.typingIndicator}
              onChange={(v) => setPref("typingIndicator", v)}
            />
          </div>
        </Section>

        <Section title="Presence">
          <div className="py-3.5">
            <Switch
              label="Share presence"
              description="Off and the room reads you as away."
              checked={prefs.showPresence}
              onChange={(v) => setPref("showPresence", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              label="Pulses"
              description="Thinking of you, without a message."
              checked={prefs.allowPulses}
              onChange={(v) => setPref("allowPulses", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              label="Haptics"
              description="A small buzz when they reach out."
              checked={prefs.haptics}
              onChange={(v) => setPref("haptics", v)}
            />
          </div>
        </Section>

        <p className="mt-8 flex items-center gap-1.5 px-1 text-[11.5px] text-zinc-600">
          <Lock className="h-3 w-3" />
          Two people per room. No groups, no discovery.
        </p>

        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
          className="mt-6 block w-full py-3 text-center text-[13.5px] text-[#FF6B6B]/80 transition-colors hover:text-[#FF6B6B]"
        >
          Sign out
        </button>

        <p className="mt-2 text-center text-[10.5px] text-zinc-700">Dolemon · v0.2</p>
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
