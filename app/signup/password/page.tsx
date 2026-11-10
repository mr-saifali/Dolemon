"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, EyeOff, KeyRound, X } from "lucide-react";
import { toast } from "sonner";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { StepDots } from "@/components/onboarding/step-dots";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { getSignupEmail } from "@/lib/signup-draft";
import { isPasswordValid, passwordRules, passwordStrength } from "@/lib/password";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export default function PasswordScreen() {
  const router = useRouter();
  const { refresh } = useSession();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const e = getSignupEmail();
    if (!e) {
      router.replace("/signup/email");
      return;
    }
    setEmail(e);
  }, [router]);

  const rules = passwordRules(password);
  const strength = passwordStrength(password);
  const valid = isPasswordValid(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) {
      setError("Use at least 8 characters, with a letter and a number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (auth.mode === "supabase" && email) {
        await auth.signUpWithPassword(email, password);
        router.push("/signup/verify");
        return;
      } else {
        await auth.createPassword(password);
      }
      await refresh();
      router.push("/signup/username");
    } catch (err) {
      const message = err instanceof AuthFailure ? err.message : "Something went wrong. Try again?";
      setError(message);
      setSubmitting(false);
      toast.error(message);
      if (err instanceof AuthFailure && err.code === "ACCOUNT_EXISTS") {
        router.push("/signin");
      }
    }
  };

  return (
    <ScreenShell
      backHref={auth.mode === "supabase" ? "/signup/email" : "/signup/verify"}
      footer={<StepDots current={auth.mode === "supabase" ? 2 : 3} total={4} />}
    >
      <form onSubmit={submit} className="flex flex-1 flex-col justify-center pt-4" noValidate>
        <Motif icon={<KeyRound className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>Create a password</ScreenTitle>
        <ScreenSubtitle>
          This keeps your account yours. You can change it any time in settings.
        </ScreenSubtitle>

        <div className="mt-8">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              invalid={Boolean(error)}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text"
            >
              {visible ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
          <FieldError message={error ?? undefined} />

          <AnimatePresence>
            {password.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-text-muted">Password strength</span>
                    <span style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    {[1, 2, 3].map((step) => (
                      <div key={step} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                        <motion.div
                          initial={false}
                          animate={{
                            width: strength.score >= step ? "100%" : "0%",
                            backgroundColor: strength.color,
                          }}
                          transition={{ duration: 0.25 }}
                          className="h-full rounded-full"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <ul className="mt-4 grid gap-2">
                  {[
                    { ok: rules.length, label: "At least 8 characters" },
                    { ok: rules.letter, label: "Contains a letter" },
                    { ok: rules.number, label: "Contains a number" },
                  ].map((rule) => (
                    <li
                      key={rule.label}
                      className={cn(
                        "flex items-center gap-2 text-[12.5px] transition-colors",
                        rule.ok ? "text-success" : "text-text-muted"
                      )}
                    >
                      {rule.ok ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      ) : (
                        <X className="h-3.5 w-3.5 opacity-50" />
                      )}
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Button type="submit" size="lg" className="mt-8 w-full" loading={submitting} disabled={!valid}>
          Continue
        </Button>

        <p className="mt-4 text-center text-[12.5px] leading-relaxed text-text-muted/80">
          A short passphrase beats a clever word. Only you will know it.
        </p>
      </form>
    </ScreenShell>
  );
}
