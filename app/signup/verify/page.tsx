"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { StepDots } from "@/components/onboarding/step-dots";
import { OtpInput } from "@/components/onboarding/otp-input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth, authMode } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { getDevCode, getSignupEmail, setDevCode } from "@/lib/signup-draft";

const RESEND_SECONDS = 30;

export default function VerifyScreen() {
  const router = useRouter();
  const [email] = useState<string | null>(() => getSignupEmail());
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const submittedFor = useRef<string>("");

  useEffect(() => {
    if (!email) router.replace("/signup/email");
  }, [email, router]);

  useEffect(() => {
    setDemoCode(getDevCode());
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = useCallback(
    async (value: string) => {
      if (!email || value.length !== 6 || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await auth.verifyOtp(email, value);
        router.push("/signup/password");
      } catch (err) {
        const message = err instanceof AuthFailure ? err.message : "Something went wrong. Try again?";
        setError(message);
        setCode("");
        setSubmitting(false);
      }
    },
    [email, router, submitting]
  );

  // Auto-submit once all six digits are in.
  useEffect(() => {
    if (code.length === 6 && submittedFor.current !== code) {
      submittedFor.current = code;
      void verify(code);
    }
  }, [code, verify]);

  const resend = async () => {
    if (!email || cooldown > 0 || resending) return;
    setResending(true);
    try {
      const result = await auth.sendOtp(email);
      if (result.devCode) {
        setDevCode(result.devCode);
        setDemoCode(result.devCode);
      }
      toast.success("New code sent", { description: `Check ${email}` });
      setCooldown(RESEND_SECONDS);
      setCode("");
      setError(null);
      submittedFor.current = "";
    } catch (err) {
      toast.error(err instanceof AuthFailure ? err.message : "Couldn't resend. Try again?");
    } finally {
      setResending(false);
    }
  };

  if (!email) return null;

  return (
    <ScreenShell backHref="/signup/email" footer={<StepDots current={2} />}>
      <div className="flex flex-1 flex-col justify-center pt-4">
        <Motif icon={<MailCheck className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>Check your inbox</ScreenTitle>
        <ScreenSubtitle>
          We sent a 6-digit code to{" "}
          <span className="font-medium text-text">{email}</span>.{" "}
          <button
            type="button"
            onClick={() => router.push("/signup/email")}
            className="text-rose underline-offset-4 hover:underline"
          >
            Change
          </button>
        </ScreenSubtitle>

        <div className="mt-9">
          <OtpInput
            value={code}
            onChange={(v) => {
              setError(null);
              setCode(v);
            }}
            onComplete={verify}
            invalid={Boolean(error)}
            disabled={submitting}
          />
          <FieldError message={error ?? undefined} />
        </div>

        {demoCode && authMode === "local" && (
          <div className="mt-5 rounded-xl2 border border-white/[0.07] bg-ink-surface/70 p-3.5">
            <p className="text-[12px] leading-relaxed text-text-muted">
              <span className="font-medium text-text">Demo mode:</span> no email is actually sent.
              Your code is{" "}
              <button
                type="button"
                onClick={() => setCode(demoCode)}
                className="font-semibold tracking-[0.2em] text-rose underline-offset-4 hover:underline"
              >
                {demoCode}
              </button>{" "}
              — tap to fill.
            </p>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-1 text-[13.5px] text-text-muted">
          {cooldown > 0 ? (
            <span>
              Didn&apos;t get it? Resend in{" "}
              <span className="tabular-nums text-text">{cooldown}s</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={resend}
              disabled={resending}
              className="font-medium text-rose underline-offset-4 hover:underline disabled:opacity-50"
            >
              {resending ? "Sending…" : "Send a new code"}
            </button>
          )}
        </div>

        {submitting && (
          <p className="mt-4 text-center text-[13px] text-text-muted">Verifying…</p>
        )}
      </div>

      <div className="pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => verify(code)}
          disabled={code.length !== 6 || submitting}
        >
          Continue
        </Button>
      </div>
    </ScreenShell>
  );
}
