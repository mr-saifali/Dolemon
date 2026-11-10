"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { OTP_LENGTH } from "@/lib/otp";
import { ScreenShell, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/onboarding/otp-input";

export default function RecoverPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      if (!sent) {
        if (auth.mode !== "supabase") throw new Error("Email recovery isn't available in the device-only demo.");
        await auth.sendOtp(email, "recovery"); setSent(true);
      } else {
        await auth.verifyOtp(email, code, "recovery"); router.replace("/recover/password");
      }
    } catch (err) { setError(err instanceof AuthFailure ? err.message : "Recovery unavailable. Check your connection or contact the app operator."); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <ScreenShell backHref="/signin">
    <form onSubmit={run} className="flex flex-1 flex-col justify-center gap-5">
      <ScreenTitle>Recover your account</ScreenTitle>
      <ScreenSubtitle>{sent ? "If this email has an account, check its inbox and spam for a sign-in link or code. Open the link, or enter the code below." : "Verify email ownership before choosing a new password. This does not create a new account."}</ScreenSubtitle>
      {!sent ? <div><Label htmlFor="recovery-email">Account email</Label><Input id="recovery-email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div>
        : <><p className="break-all text-sm text-text-muted">{email}</p><OtpInput length={OTP_LENGTH} value={code} onChange={setCode} disabled={busy} /><button type="button" className="text-sm text-rose" onClick={()=>{setSent(false);setCode("");setError("");}}>Change email or request another message</button></>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" loading={busy} disabled={sent && code.length !== OTP_LENGTH}>{sent ? "Verify code" : "Send recovery email"}</Button>
      <p className="text-xs text-text-muted">Repeated requests are rate limited. Never share your sign-in link or code.</p>
    </form>
  </ScreenShell>;
}
