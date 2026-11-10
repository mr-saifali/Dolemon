import { BodyReadError, readLimitedJson } from "@/lib/http-body";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { fetchLinkPreview } from "@/lib/link-preview-server";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!url || !key || !token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 413 });
  let body: { url?: unknown };
  try { body = await readLimitedJson(req, 4096) as typeof body; } catch (error) { return NextResponse.json({ error: "BAD_REQUEST" }, { status: error instanceof BodyReadError ? error.status : 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  if (typeof body.url !== "string" || body.url.length > 2048) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  try { return NextResponse.json(await fetchLinkPreview(body.url), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "PREVIEW_UNAVAILABLE" }, { status: 422, headers: { "Cache-Control": "no-store" } }); }
}
