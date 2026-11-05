"use client";

import { getSupabase } from "@/lib/supabase";

/** Send Doremon requests as the signed-in user; the server verifies this token. */
export async function doremonFetch(body: unknown, signal: AbortSignal): Promise<Response> {
  const client = getSupabase();
  const { data, error } = client ? await client.auth.getSession() : { data: { session: null }, error: null };
  if (error || !data.session?.access_token) {
    throw new Error("DOREMON_AUTH_REQUIRED");
  }
  return fetch("/api/doremon", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(body),
    signal,
  });
}
