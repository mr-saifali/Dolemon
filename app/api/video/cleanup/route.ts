import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { VIDEO_BUCKET } from "@/lib/video-reference";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Invoked daily by Vercel Cron; never delete storage.objects via direct SQL. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32 || !dbUrl || !serviceKey) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? ""); const expected = Buffer.from(`Bearer ${secret}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const db = createClient(dbUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let deleted = 0;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.from("temporary_chat_videos").select("id,conversation_id").lt("expires_at", new Date().toISOString()).order("expires_at").limit(100);
    if (error) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    if (!data?.length) break;
    const { error: removeError } = await db.storage.from(VIDEO_BUCKET).remove(data.map((row) => `${row.conversation_id}/${row.id}`));
    if (removeError) return NextResponse.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });
    const { error: deleteError } = await db.from("temporary_chat_videos").delete().in("id", data.map((row) => row.id)).lt("expires_at", new Date().toISOString());
    if (deleteError) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    deleted += data.length;
    if (data.length < 100) break;
  }
  return NextResponse.json({ ok: true, deleted }, { headers: { "Cache-Control": "no-store" } });
}
