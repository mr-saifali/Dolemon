"use client";

import { minimizeQuestionRequest } from "./context";
import { statsForPrompt, viewStats } from "./insights";
import type { DoremonStats } from "./types";

/** The briefing needs a summary, not the private Doremon Q&A or account IDs. */
function minimizeDaily(body: Record<string, unknown>) {
  const m = body.memory && typeof body.memory === "object" ? body.memory as Record<string, unknown> : {};
  const scalar = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 600) : null;
  const list = (value: unknown) => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").slice(-8).map((x) => x.slice(0, 180)) : [];
  const memory = { summary: scalar(m.summary), notes: list(m.notes), conflictTopics: list(m.conflictTopics), deepTopics: list(m.deepTopics), moodMine: scalar(m.moodMine), moodTheirs: scalar(m.moodTheirs), tension: typeof m.tension === "number" ? m.tension : null, fightCount: typeof m.fightCount === "number" ? m.fightCount : 0, deepTalkCount: typeof m.deepTalkCount === "number" ? m.deepTalkCount : 0 };
  const yesterday = Array.isArray(body.yesterday) ? body.yesterday.slice(-12).filter((item) => item && (item.who === "me" || item.who === "them") && typeof item.text === "string").map((item) => ({ who: item.who, text: item.text.slice(0, 110) })) : [];
  const view = viewStats(body.stats as DoremonStats | null, typeof body.meId === "string" ? body.meId : null, typeof body.partnerId === "string" ? body.partnerId : null);
  return { action: "daily", day: typeof body.day === "string" ? body.day.slice(0, 10) : null, yesterday, memory, census: statsForPrompt(view, "the other person") };
}
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
    body: JSON.stringify(body && typeof body === "object" && "action" in body ? (body.action === "ask" || body.action === "roomAsk" ? minimizeQuestionRequest(body) : body.action === "daily" ? minimizeDaily(body as Record<string, unknown>) : body) : body),
    signal,
  });
}
