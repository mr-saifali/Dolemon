"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock } from "lucide-react";
import { ChatAvatar } from "@/components/home/chat-row";
import { auth } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { isUnlocked, markUnlocked } from "@/lib/app-lock";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * The lock wall — a calm, phone-style lock screen instead of a form.
 * Big live clock, who this is locked for, one field, one button.
 */
export default function UnlockPage() {
  const router = useRouter();
  const { account, loading, signOut } = useSession();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!account) {
      router.replace("/signin");
      return;
    }
    // already unlocked in this session — straight back in
    if (!account.hasAppLock || isUnlocked(account.id)) router.replace("/app");
  }, [account, loading, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const ok = await auth.verifyAppLock(password);
      if (!ok) {
        setError("That's not it. Try again.");
        setPassword("");
        setShakeKey((k) => k + 1);
        setSubmitting(false);
        return;
      }
      markUnlocked(account.id);
      router.replace("/app");
    } catch {
      setError("Couldn't check that. Try again?");
      setShakeKey((k) => k + 1);
      setSubmitting(false);
    }
  };

  const time = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#09090B]">
      {/* quiet glows — the room, dimmed */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(255,92,122,0.10),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(104,120,255,0.10),transparent_70%)]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-[max(env(safe-area-inset-top),56px)]">
        {/* live clock */}
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="text-[64px] font-extralight leading-none tracking-tight tabular-nums text-zinc-100"
        >
          {time}
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: EASE }}
          className="mt-2.5 text-[13px] text-zinc-500"
        >
          {date}
        </motion.p>

        {/* who it's locked for */}
        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.12, ease: EASE }}
          className="mt-11 flex flex-col items-center"
        >
          <div className="relative">
            <ChatAvatar
              avatarId={account?.avatarId ?? null}
              avatarUrl={account?.avatarUrl ?? null}
              name={account?.username ?? "you"}
              size={64}
            />
            <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[#1C1C1E] shadow-sm">
              <Lock className="h-3 w-3 text-[#FF8FA3]" />
            </span>
          </div>
          <p className="mt-3.5 text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
            {account?.username ? `@${account.username}` : "Dolemon"}
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">This phone is locked for you</p>
        </motion.div>

        {/* the one field + one button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2, ease: EASE }}
          className="mt-9 w-full"
        >
          <form onSubmit={submit} noValidate>
            <motion.div key={shakeKey} animate={shakeKey > 0 ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }} transition={{ duration: 0.4 }}>
              <label htmlFor="app-lock" className="px-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                App password
              </label>
              <div className="relative mt-2">
                <input
                  id="app-lock"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your app password"
                  autoFocus
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  className={cn(
                    "w-full rounded-full bg-[#1C1C1E] py-3.5 pl-5 pr-14 text-[15px] text-zinc-100 outline-none placeholder:text-zinc-600",
                    "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] focus:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] transition-shadow",
                    error && "shadow-[inset_0_0_0_1px_rgba(255,107,107,0.45)]"
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
            </motion.div>

            <p
              aria-live="polite"
              className={cn(
                "min-h-[20px] px-1 pt-2 text-[12px] text-[#FF8B8B]",
                !error && "invisible"
              )}
            >
              {error}
            </p>

            <motion.button
              type="submit"
              whileTap={{ scale: 0.98 }}
              disabled={!password || submitting}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-medium text-white disabled:opacity-40"
              style={{ background: "var(--brand-grad)", boxShadow: "0 10px 28px -12px var(--glow-send)" }}
            >
              {submitting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
              ) : (
                <Lock className="h-4 w-4" strokeWidth={2} />
              )}
              {submitting ? "Unlocking" : "Unlock"}
            </motion.button>
          </form>
        </motion.div>

        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
          className="mt-auto pt-10 text-[12.5px] text-zinc-500 underline-offset-4 transition-colors hover:text-zinc-300 hover:underline"
        >
          Not you? Sign out
        </button>
      </div>
    </main>
  );
}
