"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { authMode } from "@/lib/auth";
import { isKnownOffline } from "@/lib/offline/connectivity";
import { isAndroidAppWebView } from "@/lib/android-app";
import { disablePush, enablePush, pushIsEnabled, pushSupport } from "@/lib/push";

export function PushSettings() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  useEffect(() => {
    const unsupported = authMode !== "supabase" ? "Push is available for signed-in live accounts." : pushSupport();
    if (unsupported) { setReason(unsupported); setChecking(false); return; }
    let alive = true;
    void fetch("/api/push/status", { cache: "no-store" }).then((response) => response.ok ? response.json() : { configured: false }).then((result) => {
      if (!alive) return;
      if (!result.configured) setReason("Notifications are not configured on this server yet.");
      else void pushIsEnabled().then((value) => { if (alive) setEnabled(value); }).catch(() => undefined);
    }).catch(() => { if (alive) setReason("Couldn’t check notification setup. Try again later."); }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, []);
  const toggle = async () => {
    if (isKnownOffline() && typeof navigator !== "undefined" && isAndroidAppWebView(navigator.userAgent)) {
      toast.error("Internet is required to change settings."); return;
    }
    setBusy(true);
    try { if (enabled) { await disablePush(); setEnabled(false); toast.success("Notifications disabled on this device"); } else { await enablePush(); setEnabled(true); toast.success("Notifications enabled on this device"); } }
    catch (error) { void pushIsEnabled().then(setEnabled).catch(() => undefined); toast.error(error instanceof Error ? error.message : "Couldn’t change notifications."); }
    finally { setBusy(false); }
  };
  return <div className="flex items-start gap-3 py-3"><span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-rose-500 text-white"><Bell className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm text-zinc-100">Message notifications</p><p className="mt-1 text-xs leading-relaxed text-zinc-500">{reason ?? "On this device. Notifications never show message text. Delivery requires server setup; iPhone requires the Home Screen app."}</p></div><button type="button" disabled={busy || checking || !!reason} onClick={() => void toggle()} className="rounded-full bg-white/10 px-3 py-2 text-xs text-white disabled:opacity-40">{checking ? "Checking…" : busy ? "Working…" : enabled ? "Turn off" : "Enable"}</button></div>;
}
