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
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { OTP_LENGTH } from "@/lib/otp";

const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const inFlight = useRef(false);
  const [email] = useState<string | null>(() => getSignupEmail());
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const submittedFor = useRef<string>("");

  useEffect(() => {
    if (!email && authMode !== "supabase") router.replace("/signup/email");
  }, [email, router]);

  // The default Supabase email uses a link. Support it as well as numeric OTP,
  // including when the link opens a different browser than the Android shell.
  useEffect(() => {
    if (authMode !== "supabase") return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const account = await refresh();
      if (alive && account && (!email || account.email.toLowerCase() === email.toLowerCase())) router.replace(account.profileComplete ? "/app" : "/signup/username");
    };
    const sub = getSupabase()?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") timer = setTimeout(() => { void check(); }, 0);
    });
    void check();
    return () => { alive = false; clearTimeout(timer); sub?.data.subscription.unsubscribe(); };
  }, [email, refresh, router]);

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
      if (!email || value.length !== OTP_LENGTH || inFlight.current) return;
      inFlight.current = true;
      setSubmitting(true);
      setError(null);
      try {
        await auth.verifyOtp(email, value);
        if (authMode === "supabase") {
          const account = await refresh();
          if (!account) throw new Error("Profile not available");
          router.replace(account.profileComplete ? "/app" : "/signup/username");
        } else router.push("/signup/password");
      } catch (err) {
        const message = err instanceof AuthFailure ? err.message : "Something went wrong. Try again?";
        setError(message);
        setCode("");
        setSubmitting(false);
        inFlight.current = false;
        submittedFor.current = "";
      }
    },
    [email, router, refresh]
  );

  // Auto-submit once the configured number of digits is present.
  useEffect(() => {
    if (code.length === OTP_LENGTH && submittedFor.current !== code) {
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

  if (!email) return <ScreenShell backHref="/signup/email"><ScreenTitle>Verify your email</ScreenTitle><ScreenSubtitle>Open the latest verification link in your email, or return to signup to request a new one.</ScreenSubtitle></ScreenShell>;

  return (
    <ScreenShell backHref={authMode === "supabase" ? "/signup/password" : "/signup/email"} footer={<StepDots current={authMode === "supabase" ? 3 : 2} />}>
      <div className="flex flex-1 flex-col justify-center pt-4">
        <Motif icon={<MailCheck className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>Check your inbox</ScreenTitle>
        <ScreenSubtitle>
          Check the verification email sent to{" "}
          <span className="font-medium text-text">{email}</span>.{" "}
          <button
            type="button"
            onClick={() => router.push("/signup/email")}
            className="text-rose underline-offset-4 hover:underline"
          >
            Change
          </button>
        </ScreenSubtitle>

        <p className="mt-4 text-sm text-text-muted">Enter the {OTP_LENGTH}-digit code if your email includes one, or open its verification link. Check spam too. Never share your code.</p>
        <div className="mt-9">
          <OtpInput
            length={OTP_LENGTH}
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
          disabled={code.length !== OTP_LENGTH || submitting}
        >
          Continue
        </Button>
      </div>
    </ScreenShell>
  );
}
