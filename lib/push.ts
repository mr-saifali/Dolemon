"use client";
import { getSupabase } from "@/lib/supabase";

function applicationKey(value: string): Uint8Array {
  const raw = atob((value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupport(): string | null {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "Push notifications aren’t supported in this browser. On iPhone, add Dolemon to your Home Screen first.";
  if (!window.isSecureContext) return "Notifications need a secure HTTPS connection.";
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "Notifications are not configured on this server yet.";
  return null;
}

export async function enablePush(): Promise<void> {
  const unavailable = pushSupport();
  if (unavailable) throw new Error(unavailable);
  // Request permission directly from the user's tap, before any network await;
  // iOS requires a user gesture for notification permission.
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. Change your browser or phone settings to allow them.");
  let configured = false;
  try { const response = await fetch("/api/push/status", { cache: "no-store" }); configured = response.ok && (await response.json()).configured === true; } catch { /* server unavailable */ }
  if (!configured) throw new Error("Notifications are not configured on this server yet.");
  const db = getSupabase();
  const { data: session } = db ? await db.auth.getSession() : { data: { session: null } };
  if (!db || !session.session?.user.id) throw new Error("Sign in to enable notifications.");
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const created = !subscription;
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) { if (created) await subscription.unsubscribe(); throw new Error("Couldn’t create a notification subscription."); }
  const { error } = await db.from("push_subscriptions").upsert({ user_id: session.session.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth, updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) { if (created) await subscription.unsubscribe(); throw new Error("Couldn’t save notification settings. Please try again."); }
}

export async function pushIsEnabled(): Promise<boolean> {
  if (pushSupport()) return false;
  const db = getSupabase();
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!db || !subscription) return false;
  const { data, error } = await db.from("push_subscriptions").select("id").eq("endpoint", subscription.endpoint).maybeSingle();
  return !error && Boolean(data);
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const db = getSupabase();
  let cleanupFailed = false;
  try { if (db) { const result = await db.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint); cleanupFailed = Boolean(result.error); } }
  catch { cleanupFailed = true; }
  finally { await subscription.unsubscribe(); }
  if (cleanupFailed) throw new Error("Notifications were disabled on this device, but server cleanup failed.");
}
