"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { StepDots } from "@/components/onboarding/step-dots";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { AuthFailure, RESERVED_USERNAMES, USERNAME_PATTERN } from "@/lib/auth/types";
import { AVATAR_PRESETS, avatarById } from "@/lib/avatars";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Availability = "idle" | "checking" | "available" | "taken" | "invalid" | "reserved";

export default function UsernameScreen() {
  const router = useRouter();
  const { account, loading, refresh } = useSession();
  const [username, setUsername] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const latestValue = useRef<string>("");

  useEffect(() => {
    if (!loading && !account) router.replace("/");
  }, [account, loading, router]);

  // Debounced availability check — this is the live feedback the spec asks for.
  useEffect(() => {
    const value = username.trim().toLowerCase();
    if (!value) {
      setAvailability("idle");
      return;
    }
    if (!USERNAME_PATTERN.test(value)) {
      setAvailability("invalid");
      return;
    }
    if (RESERVED_USERNAMES.has(value)) {
      setAvailability("reserved");
      return;
    }

    latestValue.current = value;
    setAvailability("checking");
    const handle = setTimeout(async () => {
      try {
        const free = await auth.isUsernameAvailable(value);
        // Drop stale responses when the user kept typing.
        if (latestValue.current !== value) return;
        setAvailability(free ? "available" : "taken");
      } catch {
        if (latestValue.current === value) setAvailability("idle");
      }
    }, 400);

    return () => clearTimeout(handle);
  }, [username]);

  const canContinue = availability === "available" && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;
    setSubmitting(true);
    setError(null);
    try {
      await auth.saveProfile({ username: username.trim().toLowerCase(), avatarId });
      await refresh();
      router.push("/signup/success");
    } catch (err) {
      const message = err instanceof AuthFailure ? err.message : "That didn't save. Try again?";
      setError(message);
      toast.error(message);
      setSubmitting(false);
    }
  };

  const preview = avatarById(avatarId);
  const hint: Record<Availability, string | undefined> = {
    idle: undefined,
    checking: undefined,
    available: "Available",
    taken: "That one's taken. Try another.",
    invalid: "3–20 characters. Letters, numbers, dots and underscores.",
    reserved: "That handle is reserved. Pick another.",
  };

  return (
    <ScreenShell backHref="/signup/password" footer={<StepDots current={4} />}>
      <form onSubmit={submit} className="flex flex-1 flex-col justify-center pt-4" noValidate>
        <Motif icon={<AtSign className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>Pick your name</ScreenTitle>
        <ScreenSubtitle>
          This is what the other person sees. You can change it later.
        </ScreenSubtitle>

        <div className="mt-8">
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <Input
              id="username"
              placeholder="yourname"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              prefixText="@"
              value={username}
              onChange={(e) => {
                setError(null);
                setUsername(e.target.value.toLowerCase().replace(/\s/g, ""));
              }}
              invalid={availability === "taken" || availability === "invalid" || Boolean(error)}
              className="pr-12"
            />
            <div className="pointer-events-none absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center">
              <AnimatePresence mode="wait">
                {availability === "checking" && (
                  <motion.span key="checking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
                  </motion.span>
                )}
                {availability === "available" && (
                  <motion.span
                    key="available"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-success/15 text-success"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </motion.span>
                )}
                {(availability === "taken" || availability === "invalid" || availability === "reserved") && (
                  <motion.span
                    key="bad"
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.6, opacity: 0 }}
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-danger/15 text-danger"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
          <FieldError message={error ?? undefined} />
          {!error && hint[availability] && (
            <p
              className={cn(
                "mt-2 text-[12.5px]",
                availability === "available" ? "text-success" : "text-text-muted"
              )}
            >
              {hint[availability]}
            </p>
          )}
        </div>

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium tracking-wide text-text-muted">Avatar</span>
            <span className="text-[12px] text-text-muted/70">Optional</span>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-ink-line bg-ink-surface text-xl">
              {preview ? (
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: preview.bg, boxShadow: `0 0 0 1px ${preview.ring}33` }}
                >
                  {preview.emoji}
                </span>
              ) : (
                <span className="text-text-muted">?</span>
              )}
            </div>

            <div className="grid flex-1 grid-cols-4 gap-2">
              {AVATAR_PRESETS.map((preset) => {
                const selected = avatarId === preset.id;
                return (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => setAvatarId(selected ? null : preset.id)}
                    aria-pressed={selected}
                    aria-label={`Avatar ${preset.id}`}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-xl border text-lg transition-all duration-150 active:scale-95",
                      selected ? "border-rose/60" : "border-ink-line hover:border-white/20"
                    )}
                    style={{ backgroundColor: selected ? preset.bg : "rgba(26,26,31,0.8)" }}
                  >
                    {preset.emoji}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-9 w-full" loading={submitting} disabled={!canContinue}>
          Continue
        </Button>
      </form>
    </ScreenShell>
  );
}
