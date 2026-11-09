"use client";

import { conversationPacket } from "./shared-context";
import { minimizeQuestionRequest } from "./context";
import { getSupabase } from "@/lib/supabase";

/** Text is shared only by explicitly opted-in callers, with hard server-mirrored limits. */
export async function doremonFetch(body: unknown, signal: AbortSignal): Promise<Response> {
  const client = getSupabase();
  const { data, error } = client ? await client.auth.getSession() : { data: { session: null }, error: null };
  if (error || !data.session?.access_token) throw new Error("DOREMON_AUTH_REQUIRED");
  const action = body && typeof body === "object" && "action" in body ? body.action : null;
  if (action !== "ask" && action !== "roomAsk" && action !== "daily") throw new Error("DOREMON_UNSUPPORTED_ACTION");
  return fetch("/api/doremon", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify(conversationPacket(body) ?? minimizeQuestionRequest(body)), signal,
  });
}
