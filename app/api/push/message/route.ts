import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import * as webpush from "web-push";
import { allowedPushEndpoint } from "@/lib/push-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function matchesSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called by an authenticated Supabase INSERT webhook, never by the sender's browser. */
export async function POST(req: NextRequest) {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!secret || secret.length < 32 || !supabaseUrl || !serviceKey || !publicKey || !privateKey || !subject) return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
  if (!matchesSecret(req.headers.get("x-dolemon-webhook-secret") ?? "", secret)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 32_000) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 413 });
  let payload: { type?: string; schema?: string; table?: string; record?: { id?: string } };
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const id = payload.record?.id;
  if (payload.type !== "INSERT" || payload.schema !== "public" || payload.table !== "messages" || !id || !uuid.test(id)) return NextResponse.json({ error: "BAD_EVENT" }, { status: 400 });
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: message, error: messageError } = await db.from("messages").select("id,conversation_id,sender_id").eq("id", id).maybeSingle();
  if (messageError) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  if (!message || !uuid.test(message.conversation_id)) return NextResponse.json({ ok: true });
  const { data: members, error: membersError } = await db.from("conversation_members").select("user_id").eq("conversation_id", message.conversation_id).neq("user_id", message.sender_id);
  if (membersError) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  const recipients = (members ?? []).map((member) => member.user_id);
  const { data: subscriptions, error: subscriptionsError } = recipients.length ? await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_key").in("user_id", recipients) : { data: [], error: null };
  if (subscriptionsError) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  try { webpush.setVapidDetails(subject, publicKey, privateKey); } catch { return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 }); }
  const { error: claimError } = await db.from("push_notification_events").insert({ message_id: id });
  if (claimError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (claimError) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  const body = JSON.stringify({ url: `/app/chat/${message.conversation_id}` });
  await Promise.all((subscriptions ?? []).map(async (sub) => {
    if (!allowedPushEndpoint(sub.endpoint)) return;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, body, { TTL: 3600, timeout: 8000 });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", sub.id);
      else console.error("[push] delivery failed", status ?? "network error");
    }
  }));
  return NextResponse.json({ ok: true });
}
