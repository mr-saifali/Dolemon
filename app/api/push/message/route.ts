import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import * as webpush from "web-push";
import { allowedPushEndpoint } from "@/lib/push-endpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PushTarget = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  conversation_id: string;
};

/**
 * Called by the database INSERT webhook on public.messages, never by a browser.
 *
 * The webhook secret lives in the database (`push_webhook_config`). This route
 * only forwards the header it received into `push_delivery_targets()`, which
 * validates it and returns the recipients' subscriptions — so the server never
 * stores a service-role key or the secret itself. Deduplication of webhook
 * retries also happens in that function.
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl || !anonKey || !publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
  }

  // Cheap shape check only; the database decides whether the secret is valid.
  const secret = req.headers.get("x-dolemon-webhook-secret") ?? "";
  if (secret.length < 32 || secret.length > 512) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (Number(req.headers.get("content-length") || 0) > 32_000) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 413 });
  }

  let payload: { type?: string; schema?: string; table?: string; record?: { id?: string } };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const id = payload.record?.id;
  if (payload.type !== "INSERT" || payload.schema !== "public" || payload.table !== "messages" || !id || !uuid.test(id)) {
    return NextResponse.json({ error: "BAD_EVENT" }, { status: 400 });
  }

  const db = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db.rpc("push_delivery_targets", { p_secret: secret, p_message_id: id });
  if (error) {
    if (error.code === "28000" || /unauthor/i.test(error.message)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }

  const targets = (data ?? []) as PushTarget[];
  const conversationId = targets[0]?.conversation_id;
  if (!targets.length || !conversationId || !uuid.test(conversationId)) {
    // unknown message, already claimed, or nobody subscribed
    return NextResponse.json({ ok: true });
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch {
    return NextResponse.json({ error: "PUSH_NOT_CONFIGURED" }, { status: 503 });
  }

  const body = JSON.stringify({ url: `/app/chat/${conversationId}` });

  await Promise.all(
    targets.map(async (sub) => {
      if (!allowedPushEndpoint(sub.endpoint)) return;
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          body,
          { TTL: 3600, timeout: 8000 }
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.rpc("push_forget_subscription", { p_secret: secret, p_subscription_id: sub.subscription_id });
        } else {
          console.error("[push] delivery failed", status ?? "network error");
        }
      }
    })
  );

  return NextResponse.json({ ok: true });
}
