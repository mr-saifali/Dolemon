import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The build id this deployment serves. The Android shell compares it with the
 * id baked into the bundle it is running and re-opens the site when a newer
 * one is live — a WebView that has been open for days otherwise keeps running
 * the JavaScript it booted with, so merged fixes never reach the phone.
 */
export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_APP_BUILD ?? "dev" },
    { headers: { "cache-control": "no-store, max-age=0" } }
  );
}
