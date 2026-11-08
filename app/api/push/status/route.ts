import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
/** Configuration only: no keys or delivery state are exposed. */
export function GET() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
  return NextResponse.json({ configured }, { headers: { "Cache-Control": "no-store" } });
}
