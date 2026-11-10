"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthFailure } from "@/lib/auth/types";
import { getSupabase } from "@/lib/supabase";
import { useSession, landingFor } from "@/lib/session";
import { isPasswordValid } from "@/lib/password";
import { ScreenShell, ScreenTitle, ScreenSubtitle } from "@/components/screen-shell";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RecoveryPasswordPage() {
  const router = useRouter();
  const { refresh } = useSession();
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  useEffect(()=>{
    let alive=true;
    let timer: ReturnType<typeof setTimeout>;
    const check=async()=>{
      const result=await getSupabase()?.auth.getUser();
      if(alive){setEmail(result?.data.user?.email_confirmed_at ? result.data.user.email ?? null : null);setChecking(false);}
    };
    const sub=getSupabase()?.auth.onAuthStateChange(event=>{if(event==="SIGNED_IN")timer=setTimeout(()=>{void check();},0);});
    void check();
    return()=>{alive=false;clearTimeout(timer);sub?.data.subscription.unsubscribe();};
  },[]);
  const submit=async(event: React.FormEvent)=>{
    event.preventDefault();
    if(inFlight.current || !email)return;
    if(!isPasswordValid(password)||password!==confirm){setError("Use 8+ characters with a letter and number, and make both entries match.");return;}
    inFlight.current=true;setBusy(true);setError("");
    try{await auth.createPassword(password);const account=await refresh();router.replace(landingFor(account));}
    catch(err){setError(err instanceof AuthFailure?err.message:"Couldn't update your password. Try again.");}
    finally{inFlight.current=false;setBusy(false);}
  };
  return <ScreenShell backHref="/signin"><form onSubmit={submit} className="flex flex-1 flex-col justify-center gap-5">
    <ScreenTitle>Choose a new password</ScreenTitle>
    <ScreenSubtitle>{checking?"Checking your verification link…":email?`Updating the password for ${email}.`:"Your link may have expired. Request a new recovery email and open its latest link."}</ScreenSubtitle>
    {email?<><div><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} required /></div><div><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} required /></div><Button type="submit" loading={busy}>Save password</Button></>:!checking&&<Link href="/recover" className="text-rose">Request a new recovery email</Link>}
    {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
  </form></ScreenShell>;
}
