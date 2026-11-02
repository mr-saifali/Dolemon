"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { toast } from "sonner";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth, isSupabaseConfigured, useDemoMode } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { landingFor, useSession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("That email doesn't look right."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

export default function SignInPage() {
  const router = useRouter();
  const { account, loading, refresh } = useSession();
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  useEffect(() => {
    if (!loading && account) router.replace(landingFor(account));
  }, [account, loading, router]);

  const submit = async (values: FormValues) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await auth.signInWithPassword(values.email, values.password);
      const next = await refresh();
      toast.success("Welcome back");
      router.replace(landingFor(next));
    } catch (err) {
      const message = err instanceof AuthFailure ? err.message : "Something went wrong. Try again?";
      setFormError(message);
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell backHref="/">
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col justify-center" noValidate>
        <Motif icon={<LogIn className="h-6 w-6" strokeWidth={1.75} />} />
        <ScreenTitle>Welcome back.</ScreenTitle>
        <ScreenSubtitle>Sign in to pick up where you left off.</ScreenSubtitle>

        <div className="mt-8 space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              autoFocus
              invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
            <FieldError message={form.formState.errors.email?.message} />
          </div>

          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Your password"
                invalid={Boolean(form.formState.errors.password) || Boolean(formError)}
                className="pr-12"
                {...form.register("password")}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:text-text"
              >
                {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
            <FieldError message={form.formState.errors.password?.message ?? formError ?? undefined} />
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-7 w-full" loading={submitting}>
          Sign in
        </Button>

        <p className="mt-6 text-center text-[14px] text-text-muted">
          New here?{" "}
          <Link href="/signup/email" className="font-medium text-text underline-offset-4 hover:text-rose hover:underline">
            Create an account
          </Link>
        </p>

        {isSupabaseConfigured && (
          <div className="mt-8 rounded-xl border border-ink-line bg-ink-surface/60 p-3 text-center">
            <p className="text-[11.5px] leading-relaxed text-text-muted">
              Sign-in email nahi aa raha? Free Supabase projects email bhejne me limit karte hain.
            </p>
            <button
              type="button"
              onClick={() => {
                useDemoMode();
                toast.success("Demo mode on this device", {
                  description: "Koi email nahi — OTP screen par hi dikhega.",
                });
                router.push("/signup/email");
              }}
              className="mt-2 text-[12.5px] font-medium text-rose underline-offset-4 hover:underline"
            >
              Is device par demo mode se kholo →
            </button>
          </div>
        )}
      </form>
    </ScreenShell>
  );
}
