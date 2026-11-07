"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MessageSquareDashed,
  Music,
  Radio,
  ShieldCheck,
  Sparkles,
  Trash2,
  Vibrate,
  Volume2,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { PushSettings } from "@/components/pwa/push-settings";
import { AppGuard } from "@/components/app-guard";
import { ChatThemePicker } from "@/components/chat/ChatThemePicker";
import { getChatTheme } from "@/lib/chat-themes";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { AUTO_LOCK_OPTIONS, clearUnlocked, markUnlocked, type AutoLockId } from "@/lib/app-lock";
import { AVATAR_PRESETS, avatarById } from "@/lib/avatars";
import { uploadAvatarImage } from "@/lib/db";
import { compressImage } from "@/lib/media";
import { passwordStrength } from "@/lib/password";
import { useSession } from "@/lib/session";
import { setPref, usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { APP_RELEASE_NAME, APP_VERSION } from "@/lib/version";

const TILES: Record<string, string> = {
  rose: "linear-gradient(150deg,#FF5C7A,#FF8FA3)",
  peach: "linear-gradient(150deg,#FF9E6B,#FFC08A)",
  violet: "linear-gradient(150deg,#8B7BFF,#B9A7FF)",
  mint: "linear-gradient(150deg,#2FD3B4,#7FF0D6)",
  sky: "linear-gradient(150deg,#4AA8F0,#8FD3FF)",
  amber: "linear-gradient(150deg,#F5B94C,#FFE08A)",
};

function Tile({
  children,
  tone = "rose",
}: {
  children: React.ReactNode;
  tone?: keyof typeof TILES;
}) {
  return (
    <span
      className="mt-[1px] flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-white shadow-[0_5px_14px_-6px_rgba(0,0,0,0.9)]"
      style={{ backgroundImage: TILES[tone] }}
      aria-hidden
    >
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-1 flex items-center gap-2 px-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        <span className="h-1 w-1 rounded-full" style={{ background: "var(--brand-grad)" }} />
        {title}
      </h2>
      <div className="divide-y divide-white/[0.055]">{children}</div>
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [clearArmed, setClearArmed] = useState(false);
  const photoInput = useRef<HTMLInputElement | null>(null);
  const prefs = usePrefs();

  const avatar = avatarById(account?.avatarId);
  const strength = passwordStrength(lockPassword);

  const setPrivacy = async (value: boolean) => {
    try {
      await auth.setPrivate(value);
      await refresh();
      toast.success(value ? "You're private now" : "You're visible in search again");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change that");
    }
  };

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

  const pickPhoto = () => photoInput.current?.click();

  const uploadPhoto = async (file: File) => {
    setUploadingPhoto(true);
    try {
      const { dataUrl } = await compressImage(file, 720, 0.82);
      const url = await uploadAvatarImage(dataUrl);
      await auth.setAvatar(url);
      await refresh();
      toast.success("Photo updated");
    } catch {
      toast.error("Couldn't upload that photo. Try a smaller one?");
    } finally {
      setUploadingPhoto(false);
      if (photoInput.current) photoInput.current.value = "";
    }
  };

  const removePhoto = async () => {
    setUploadingPhoto(true);
    try {
      await auth.setAvatar(null);
      await refresh();
      toast.success("Photo removed");
    } catch {
      toast.error("Couldn't remove that.");
    } finally {
      setUploadingPhoto(false);
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
        className="pointer-events-none absolute -right-28 -top-32 h-[360px] w-[360px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.12),transparent_70%)]"
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
          <button
            type="button"
            onClick={pickPhoto}
            aria-label="Change profile photo"
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[24px] transition-transform active:scale-95"
            style={{
              background: avatar
                ? `radial-gradient(120% 120% at 20% 0%, ${avatar.bg} 0%, rgba(24,24,27,1) 100%)`
                : "radial-gradient(120% 120% at 20% 0%, rgba(255,92,122,0.22) 0%, rgba(24,24,27,1) 100%)",
              boxShadow: `inset 0 0 0 1px ${(avatar?.ring ?? "#FF5C7A")}2a`,
            }}
          >
            {account?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={account.avatarUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="text-[30px]">{avatar?.emoji ?? "🌙"}</span>
            )}

            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/55 py-1 text-[9.5px] font-medium tracking-wide text-white/90 backdrop-blur-sm">
              <Camera className="h-2.5 w-2.5" /> photo
            </span>

            {uploadingPhoto && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[19px] font-light tracking-[-0.01em] text-zinc-100">
              @{account?.username ?? "you"}
            </p>
            <p className="truncate text-[12px] text-zinc-500">{account?.email}</p>
            <div className="mt-1.5 flex items-center gap-3">
              <button
                type="button"
                onClick={pickPhoto}
                disabled={uploadingPhoto}
                className="text-[11.5px] text-[#FF8FA3] transition-opacity disabled:opacity-50"
              >
                {account?.avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {account?.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void removePhoto()}
                  disabled={uploadingPhoto}
                  className="text-[11.5px] text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadPhoto(file);
          }}
        />

        <p className="mt-7 px-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-600">
          Or pick a mood
        </p>

        <div className="mt-2 grid grid-cols-8 gap-1.5">
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
                  "press relative flex h-10 items-center justify-center rounded-[12px] text-[19px] active:scale-95",
                  selected && "ring-[1.5px] ring-[#FF8FA3]/80"
                )}
                style={{
                  backgroundColor: selected ? preset.bg : "rgba(255,255,255,0.035)",
                  boxShadow: selected
                    ? `0 6px 18px -8px ${preset.ring}`
                    : `inset 0 0 0 1px ${preset.ring}1f`,
                }}
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

        <Section title="Look">
          <div className="grid grid-cols-2 gap-2.5 p-3.5">
            <button
              type="button"
              onClick={() => setPref("appearance", "feminine")}
              aria-pressed={prefs.appearance === "feminine"}
              className={cn(
                "flex flex-col gap-3 rounded-[18px] border p-3.5 text-left transition-colors",
                prefs.appearance === "feminine"
                  ? "border-rose/50 bg-rose/[0.04]"
                  : "border-white/[0.06] hover:bg-white/[0.02]"
              )}
            >
              <div className="space-y-1.5">
                <div className="flex justify-end">
                  <span
                    className="block h-6 w-20 rounded-[10px] rounded-br-[3px]"
                    style={{ background: "linear-gradient(165deg,#8F7BFF,#6D5AE8)" }}
                  />
                </div>
                <div className="flex">
                  <span className="block h-6 w-16 rounded-[10px] rounded-bl-[3px] bg-[#1C1C1E]" />
                </div>
              </div>
              <div className="-mt-1">
                <p className="text-[13px] font-medium text-zinc-200">Feminine</p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                  Rose &amp; deep violet, soft edges
                </p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setPref("appearance", "masculine")}
              aria-pressed={prefs.appearance === "masculine"}
              className={cn(
                "flex flex-col gap-3 rounded-[18px] border p-3.5 text-left transition-colors",
                prefs.appearance === "masculine"
                  ? "border-[#C8A45D]/55 bg-[#C8A45D]/[0.05]"
                  : "border-white/[0.06] hover:bg-white/[0.02]"
              )}
            >
              <div className="space-y-1.5">
                <div className="flex justify-end">
                  <span
                    className="block h-6 w-20 rounded-[10px] rounded-br-[3px]"
                    style={{
                      background: "linear-gradient(165deg,#272732,#16161d)",
                      boxShadow: "inset 0 0 0 1px rgba(200,164,93,0.4)",
                    }}
                  />
                </div>
                <div className="flex">
                  <span className="block h-6 w-16 rounded-[10px] rounded-bl-[3px] bg-[#1C1C1E]" />
                </div>
              </div>
              <div className="-mt-1">
                <p className="text-[13px] font-medium text-zinc-200">Masculine</p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                  Onyx &amp; champagne gold, sharper
                </p>
              </div>
            </button>
          </div>
        </Section>

        <Section title="Notifications"><PushSettings /></Section>

        <Section title="Chats &amp; privacy">
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="violet"><EyeOff className="h-[15px] w-[15px]" /></Tile>}
              label="Private account"
              description="Out of search — only an exact handle in “Invite a friend” finds you."
              checked={account?.isPrivate ?? false}
              onChange={(v) => void setPrivacy(v)}
            />
          </div>

          <div className="py-3">
            <button
              type="button"
              onClick={() => setLockOpen((o) => !o)}
              aria-expanded={lockOpen}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <div className="flex items-start gap-3">
                <Tile tone="rose">
                  <Lock className="h-[15px] w-[15px]" />
                </Tile>
                <div>
                <p className="text-[14.5px] text-zinc-200">App lock</p>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">
                  {account?.hasAppLock
                    ? "On — asked when Dolemon opens, and when you've been away."
                    : "A soft screen lock, not encryption."}
                </p>
                </div>
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
                  {account?.hasAppLock && (
                    <div className="mt-2 rounded-2xl border border-[#FF5C7A]/20 bg-[#FF5C7A]/[0.06] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[12px] text-zinc-300">
                          <ShieldCheck className="h-3.5 w-3.5 text-[#FF8FA3]" />
                          Locked after {prefs.autoLock === "instant" ? "you leave" : prefs.autoLock.replace("m", " minutes")} away
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            clearUnlocked();
                            toast.success("Locked. Open Dolemon again to unlock.");
                            router.replace("/unlock");
                          }}
                          className="rounded-full bg-[#FF5C7A] px-3 py-1 text-[11.5px] font-medium text-white"
                        >
                          Lock now
                        </button>
                      </div>

                      <p className="mt-3 px-0.5 text-[10.5px] uppercase tracking-[0.14em] text-zinc-500">
                        Ask for it again
                      </p>
                      <div className="mt-1.5 flex gap-1.5">
                        {AUTO_LOCK_OPTIONS.map((option) => {
                          const active = prefs.autoLock === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setPref("autoLock", option.id as AutoLockId)}
                              className={cn(
                                "flex-1 rounded-full px-2 py-1.5 text-[11.5px] font-medium transition-colors",
                                active
                                  ? "bg-[linear-gradient(135deg,#FF5C7A,#FFA07A)] text-white"
                                  : "bg-white/[0.06] text-zinc-400"
                              )}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

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
              icon={<Tile tone="sky"><Eye className="h-[15px] w-[15px]" /></Tile>}
              label="Read receipts"
              description="Let them know you've seen it."
              checked={prefs.readReceipts}
              onChange={(v) => setPref("readReceipts", v)}
            />
          </div>

          <div className="py-3.5">
            <Switch
              icon={<Tile tone="violet"><MessageSquareDashed className="h-[15px] w-[15px]" /></Tile>}
              label="Typing"
              description="Show the dots while you write."
              checked={prefs.typingIndicator}
              onChange={(v) => setPref("typingIndicator", v)}
            />
          </div>
        </Section>

        <Section title="Doremon &amp; AI">
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="sky"><Sparkles className="h-[15px] w-[15px]" /></Tile>}
              label="Automatic chat analysis"
              description="Optional: analyze recent chat text on this device and save a personal memory. Turn off to stop future analysis; existing memories remain. Consider the other person's consent."
              checked={prefs.doremonAnalysis}
              onChange={(v) => setPref("doremonAnalysis", v)}
            />
            <p className="mt-2 pl-12 text-xs leading-relaxed text-zinc-500">When you ask Doremon or request a daily briefing, chat excerpts and memory can be sent to Google Gemini. AI interpretations may be wrong.</p>
          </div>
        </Section>

        <Section title="Presence">
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="mint"><Radio className="h-[15px] w-[15px]" /></Tile>}
              label="Share presence"
              description="Shares your online status while this app is visible. Turning it off stops future updates from this device; earlier timestamps may remain."
              checked={prefs.showPresence}
              onChange={(v) => setPref("showPresence", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="rose"><Sparkles className="h-[15px] w-[15px]" /></Tile>}
              label="Pulses"
              description="Demo pulses only. Live pulses are not available yet."
              checked={prefs.allowPulses}
              onChange={(v) => setPref("allowPulses", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="amber"><Vibrate className="h-[15px] w-[15px]" /></Tile>}
              label="Haptics"
              description="A small buzz when they reach out."
              checked={prefs.haptics}
              onChange={(v) => setPref("haptics", v)}
            />
          </div>
        </Section>

        <Section title="Chat Theme">
          <div className="py-4">
            <p className="text-[14.5px] font-medium text-zinc-200">Make the room yours</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">Choose a default for your chats, or pick a different background inside each chat. Your choice stays on this device.</p>
            <div className="mt-4">
              <ChatThemePicker value={getChatTheme(prefs.chatTheme).id} onChange={(id) => setPref("chatTheme", id)} />
            </div>
          </div>
        </Section>

        <Section title="Feel">
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="violet"><Wind className="h-[15px] w-[15px]" /></Tile>}
              label="Reduce motion"
              description="Fewer slides and springs, everywhere."
              checked={prefs.reduceMotion}
              onChange={(v) => setPref("reduceMotion", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="peach"><MessageSquareDashed className="h-[15px] w-[15px]" /></Tile>}
              label="Compact chat"
              description="Tighter bubbles, more of the thread on screen."
              checked={prefs.compactChat}
              onChange={(v) => setPref("compactChat", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="amber"><Volume2 className="h-[15px] w-[15px]" /></Tile>}
              label="Message sounds"
              description="A quiet chime when their message lands."
              checked={prefs.sounds}
              onChange={(v) => setPref("sounds", v)}
            />
          </div>
          <div className="py-3.5">
            <Switch
              icon={<Tile tone="sky"><Music className="h-[15px] w-[15px]" /></Tile>}
              label="Intro music"
              description="A short jingle when you open Dolemon."
              checked={prefs.introMusic}
              onChange={(v) => setPref("introMusic", v)}
            />
          </div>
        </Section>

        <Section title="Your data">
          <div className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex items-start gap-3">
              <Tile tone="sky"><Copy className="h-[15px] w-[15px]" /></Tile>
              <div>
                <p className="text-[14.5px] text-zinc-200">Your handle</p>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">
                  @{account?.username ?? "you"} — share it so they can find you.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const handle = account?.username ? `@${account.username}` : "";
                if (!handle) return;
                navigator.clipboard?.writeText(handle).then(
                  () => toast.success("Handle copied"),
                  () => toast.error("Couldn't copy")
                );
              }}
              className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-zinc-300 active:scale-95"
            >
              Copy
            </button>
          </div>

          <div className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex items-start gap-3">
              <Tile tone="rose"><Trash2 className="h-[15px] w-[15px]" /></Tile>
              <div>
                <p className="text-[14.5px] text-zinc-200">Clear local cache</p>
                <p className="mt-0.5 text-[12.5px] text-zinc-500">
                  Demo threads and preferences on this device. Nothing on the server.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!clearArmed) {
                  setClearArmed(true);
                  window.setTimeout(() => setClearArmed(false), 3000);
                  return;
                }
                try {
                  Object.keys(window.localStorage)
                    .filter((key) => key.startsWith("dolemon:"))
                    .forEach((key) => window.localStorage.removeItem(key));
                  if ("caches" in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((key) => caches.delete(key)));
                  }
                  setClearArmed(false);
                  toast.success("Local cache cleared");
                } catch {
                  toast.error("Couldn't clear the cache");
                }
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11.5px] active:scale-95",
                clearArmed ? "bg-[#FF6B6B]/20 text-[#FF8B8B]" : "bg-white/[0.06] text-zinc-300"
              )}
            >
              {clearArmed ? "Tap again" : "Clear"}
            </button>
          </div>
        </Section>

        <div className="mt-9 flex flex-col items-center gap-1.5">
          <p className="wordmark flex items-center gap-1.5 text-[13px] font-medium text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
            Dolemon
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-600">
            <Lock className="h-3 w-3" />
            Two people per room. No groups, no discovery.
          </p>
        </div>

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

        <Link
          href="/download"
          className="press hairline mt-6 flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3.5 active:bg-white/[0.06]"
        >
          <span className="flex items-center gap-2.5">
            <Download className="h-4 w-4 text-[#FF8FA3]" />
            <span className="text-[13.5px] text-zinc-200">Install the app</span>
          </span>
          <span className="flex items-center gap-1 text-[11.5px] text-zinc-500">
            v{APP_VERSION}
            <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
          </span>
        </Link>

        <p className="mt-3 text-center text-[10.5px] text-zinc-600">
          v{APP_VERSION} · {APP_RELEASE_NAME}
        </p>
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
