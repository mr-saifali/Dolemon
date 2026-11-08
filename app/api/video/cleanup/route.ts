import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { VIDEO_BUCKET } from "@/lib/video-reference";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ExpiredVideo = { video_id: string; conversation_id: string };

/**
 * Invoked daily by Vercel Cron. Cleanup only — it can remove nothing that is
 * not already past `expires_at`, so it needs no service-role key: the database
 * policies decide what is eligible and the anon key is enough to call them.
 * Storage objects are never deleted with raw SQL.
 */
export async function GET(request: NextRequest) {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!dbUrl || !anonKey) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });

  // When a cron secret is configured, require it. Without one the endpoint is
  // still safe: every statement is bounded by the expiry rules above.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const actual = Buffer.from(request.headers.get("authorization") ?? "");
    const expected = Buffer.from(`Bearer ${secret}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
  }

  const db = createClient(dbUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let deleted = 0;
  for (let i = 0; i < 5; i++) {
    const { data, error } = await db.rpc("expired_temporary_videos");
    if (error) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    const rows = (data ?? []) as ExpiredVideo[];
    if (!rows.length) break;

    const { error: removeError } = await db.storage
      .from(VIDEO_BUCKET)
      .remove(rows.map((row) => `${row.conversation_id}/${row.video_id}`));
    if (removeError) return NextResponse.json({ error: "STORAGE_UNAVAILABLE" }, { status: 503 });

    const { data: removed, error: deleteError } = await db.rpc("delete_temporary_video_metadata", {
      p_ids: rows.map((row) => row.video_id),
    });
    if (deleteError) return NextResponse.json({ error: "DATABASE_UNAVAILABLE" }, { status: 503 });
    deleted += Number(removed ?? rows.length);
    if (rows.length < 100) break;
  }
  return NextResponse.json({ ok: true, deleted }, { headers: { "Cache-Control": "no-store" } });
}
