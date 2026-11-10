"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Download, Eye, EyeOff, LogIn } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { toast } from "sonner";
import { ScreenShell, Motif, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { auth } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { landingFor, useSession } from "@/lib/session";

const schema = z.object({
  email: z.string().trim().min(1, "Enter your email.").email("That email doesn't look right."),
  password: z.string().min(1, "Enter your password."),
});

type FormValues = z.infer<typeof schema>;

export default function SignInPage() {
  const { androidApp, environmentReady } = usePwa();
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
      let next = await refresh();
      if (!next) {
        // signed in, but the profile fetch hiccuped — the session is saved,
        // so one retry before we say anything
        await new Promise((resolve) => setTimeout(resolve, 700));
        next = await refresh();
      }
      if (!next) {
        setFormError("You're signed in — we just couldn't load your profile yet. Refresh the page and it'll pick back up.");
        setSubmitting(false);
        return;
      }
      toast.success("Welcome back");
      router.replace(landingFor(next));
    } catch (err) {
      const message = err instanceof AuthFailure ? err.message : "Something went wrong. Try again?";
      setFormError(message);
      setSubmitting(false);
    }
  };

  return (
    <ScreenShell>
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

        <Link href="/recover" className="mt-4 text-center text-sm text-rose">Forgot your password?</Link>
        <Link href="/privacy" className="mt-3 text-center text-xs text-text-muted underline">Privacy and product limitations</Link>
        {environmentReady && !androidApp && <>
        <Link
          href="/download"
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-[14px] font-medium text-zinc-100 transition-colors hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download Android APK
        </Link>
        <p className="mt-2 text-center text-xs leading-relaxed text-zinc-400">
          Test build · Read cached chats offline; connect to send and receive. Browser push is available where supported. Closed-app Android push needs additional setup. Uninstalling erases local app data.
        </p>
        </>}

        <p className="mt-6 text-center text-[14px] text-text-muted">
          New here?{" "}
          <Link href="/signup/email" className="font-medium text-text underline-offset-4 hover:text-rose hover:underline">
            Create an account
          </Link>
        </p>

      </form>
    </ScreenShell>
  );
}
