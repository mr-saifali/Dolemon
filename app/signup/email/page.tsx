"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { StepDots } from "@/components/onboarding/step-dots";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { getSignupEmail, setDevCode, setSignupEmail } from "@/lib/signup-draft";
import { OTP_LENGTH } from "@/lib/otp";
import { useSession, landingFor } from "@/lib/session";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "We need an email to send your code.")
    .email("That email doesn't look right."),
});

type FormValues = z.infer<typeof schema>;

export default function EmailScreen() {
  const router = useRouter();
  const { account, loading } = useSession();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    const saved = getSignupEmail();
    if (saved && !form.getValues("email")) form.setValue("email", saved);
  }, [form]);

  useEffect(() => {
    if (!loading && account) router.replace(landingFor(account));
  }, [account, loading, router]);

  const onSubmit = async (values: FormValues) => {
    const email = values.email.trim().toLowerCase();
    setSubmitting(true);
    try {
      // Supabase is configured with confirmation off, so there is no code to send —
      // the password becomes the proof instead of an inbox.
      if (auth.mode === "supabase") {
        setSignupEmail(email);
        router.push("/signup/password");
        return;
      }
      const result = await auth.sendOtp(email);
      setSignupEmail(email);
      if (result.devCode) setDevCode(result.devCode);
      toast.success("Code sent", { description: `Check ${email}` });
      router.push("/signup/verify");
    } catch (err) {
      const message = err instanceof AuthFailure ? err.message : "Something went wrong. Try again?";
      form.setError("email", { message });
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell backHref="/signin" footer={<StepDots current={1} total={auth.mode === "supabase" ? 3 : 4} />}>
      <div className="flex flex-1 flex-col justify-center pt-4">
        <Motif icon={<Mail className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>What&apos;s your email?</ScreenTitle>
        <ScreenSubtitle>
          {auth.mode === "supabase"
            ? "No emails, no codes. Pick a password next and you're in."
            : `We'll send a ${OTP_LENGTH}-digit code to make sure it's really you. No spam, ever.`}
        </ScreenSubtitle>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8" noValidate>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
            invalid={Boolean(form.formState.errors.email)}
            aria-describedby="email-error"
            {...form.register("email")}
          />
          <div id="email-error">
            <FieldError message={form.formState.errors.email?.message} />
          </div>

          <Button type="submit" size="lg" className="mt-6 w-full" loading={submitting}>
            Continue
          </Button>

          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-text-muted/80">
            We only use this to keep your account safe and to help you get back in.
          </p>
        </form>
      </div>
    </ScreenShell>
  );
}
