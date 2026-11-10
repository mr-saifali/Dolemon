import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
const CHAT_MEDIA_BUCKET = "chat-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Deletes chat-media objects whose conversation row is gone. Once a chat is
 * deleted its members can no longer sign those objects, so removing them is
 * pure data hygiene — which is why the database policies let this run with the
 * anon key and no service-role secret.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const actual = Buffer.from(request?.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!dbUrl || !anonKey) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  const db = createClient(dbUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let deleted = 0;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.rpc("orphan_chat_media", { p_limit: 200 });
    if (error) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    const names = ((data ?? []) as { object_name: string }[]).map((row) => row.object_name).filter(Boolean);
    if (!names.length) break;
    const { error: removeError } = await db.storage.from(CHAT_MEDIA_BUCKET).remove(names);
    if (removeError) return NextResponse.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
    deleted += names.length;
    if (names.length < 200) break;
  }
  return NextResponse.json({ ok: true, deleted }, { headers: { "Cache-Control": "no-store" } });
}
