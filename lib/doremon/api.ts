"use client";

import { getSupabase } from "@/lib/supabase";
import { readProfile } from "@/lib/personal/store";

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
    // Every request carries the one-owner Constitution, so the brain answers
    // THIS person in THEIR language — never a generic couple.
    body: JSON.stringify({ ...(body as Record<string, unknown>), profile: readProfile() }),
    signal,
  });
}
