import { NextResponse, type NextRequest } from "next/server";
import {
  ANALYZE_INSTRUCTIONS,
  ASK_INSTRUCTIONS,
  DOREMON_PERSONA,
  FINALIZE_INSTRUCTIONS,
  ROOM_ANALYST_INSTRUCTIONS,
  compactTranscript,
  memoryForPrompt,
} from "@/lib/doremon/persona";
import { statsForPrompt, viewStats } from "@/lib/doremon/insights";
import type { DoremonMemory, DoremonStats } from "@/lib/doremon/types";

/**
 * Doremon's mind, server-side — the Gemini key never reaches the browser.
 *
 *   POST /api/doremon  { action: "analyze" | "ask" | "roomAsk" | "finalize", ... }
 *
 *   analyze   → the compressed record update + fight/boring signals (JSON out)
 *   ask       → Doremon's chat answer to a /doremon message (text out)
 *   roomAsk   → his private-room answer: memories, census, prediction (text out)
 *   finalize  → the closing record when a conversation pauses (JSON out)
 *
 * Model: GEMINI_MODEL (default gemini-2.5-flash — bump it to the newest
 * flash release whenever Google ships one).
 */

export const runtime = "nodejs";
export const maxDuration = 30;

type RequestBody = {
  action: "analyze" | "ask" | "roomAsk" | "finalize";
  me: string;
  partner: string;
  /** user ids — needed to give the census a perspective (me vs them) */
  meId?: string | null;
  partnerId?: string | null;
  recent: { who: "me" | "them"; text: string }[];
  memory: unknown;
  /** the raw talking census from doremon_stats() (may be null post-deletion) */
  stats?: DoremonStats | null;
  question?: string;
};

const ok = (payload: unknown) => NextResponse.json(payload);

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_BODY" }, { status: 400 });
  }

  const actions = ["analyze", "ask", "roomAsk", "finalize"] as const;
  if (!(actions as readonly string[]).includes(body.action)) {
    return NextResponse.json({ ok: false, error: "BAD_ACTION" }, { status: 400 });
  }

  const { system, user } = promptsFor(body);

  try {
    const wantJson = body.action === "analyze" || body.action === "finalize";
    const raw = await generateContent(key, model, system, user, wantJson, body.action);
    if (body.action === "analyze") {
      const parsed = parseJson(raw);
      if (!parsed) throw new Error("unparseable analysis");
      return ok({ ok: true, analysis: parsed });
    }
    if (body.action === "finalize") {
      const parsed = parseJson(raw);
      if (!parsed) throw new Error("unparseable finalize");
      const summary = typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 800) : "";
      const note = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 400) : "";
      if (!summary) throw new Error("empty final summary");
      return ok({ ok: true, final: { summary, note } });
    }
    return ok({ ok: true, answer: raw.slice(0, 1400) });
  } catch (error) {
    console.error("[doremon] gemini failure:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "GEMINI" }, { status: 502 });
  }
}

function promptsFor(body: RequestBody): { system: string; user: string } {
  // Compressed LOCALLY (empties dropped, long lines clipped, last 12 kept)
  // so we only spend tokens on signal before the API call.
  const transcript = compactTranscript(body.recent, body.me, body.partner);

  const memoryBlock = memoryForPrompt(
    body.memory as Parameters<typeof memoryForPrompt>[0]
  );

  const census = statsForPrompt(viewStats(body.stats ?? null, body.meId ?? null, body.partnerId ?? null), body.partner);

  if (body.action === "analyze") {
    return {
      system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon working for the pair "${body.me}" and "${body.partner}".\n\n${ANALYZE_INSTRUCTIONS}`,
      user: `YOUR MEMORY SO FAR:\n${memoryBlock}\n\nTHE TALKING CENSUS:\n${census}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation is empty)"}`,
    };
  }

  if (body.action === "roomAsk") {
    const question = body.question?.trim() || "";
    return {
      system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon in his private room, talking one-to-one with "${body.me}" about their relationship with "${body.partner}".\n\n${ROOM_ANALYST_INSTRUCTIONS}`,
      user: `YOUR PRIVATE MEMORY OF THEM:\n${memoryBlock}\n\nTHE TALKING CENSUS:\n${census}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation has no recent messages — answer from memory and the census)"}\n\n${
        question
          ? `THE QUESTION: ${question}`
          : "They opened your room without a question — give a short opening: the current state of their relationship in one or two lines, plus the most interesting thing you noticed."
      }`,
    };
  }

  if (body.action === "finalize") {
    return {
      system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon, the private observer of the pair "${body.me}" and "${body.partner}".\n\n${FINALIZE_INSTRUCTIONS}`,
      user: `YOUR MEMORY SO FAR:\n${memoryBlock}\n\nTHE TALKING CENSUS:\n${census}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation has no messages)"}`,
    };
  }

  const question = body.question?.trim() || "";
  return {
    system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon, talking with the pair "${body.me}" and "${body.partner}" in their private chat. One of them is writing to you right now.\n\n${ASK_INSTRUCTIONS}`,
    user: `YOUR MEMORY OF THEM:\n${memoryBlock}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation is empty)"}\n\n${
      question ? `THEY SAID: ${question}` : "They just wrote /doremon with no question — give a short check-in: what you noticed, what you remember, one small suggestion."
    }`,
  };
}

/**
 * Per-action output budgets: cap the answer at the length the format needs.
 * Smaller cap = faster first token, less spend, no run-on answers.
 */
const OUTPUT_CAPS: Record<string, number> = {
  analyze: 500,
  finalize: 450,
  ask: 300,
  roomAsk: 320,
};

async function generateContent(
  key: string,
  model: string,
  system: string,
  user: string,
  wantJson: boolean,
  action: string
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: wantJson ? 0.3 : 0.9,
    maxOutputTokens: OUTPUT_CAPS[action] ?? 320,
  };
  if (wantJson) generationConfig.responseMimeType = "application/json";

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  };

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  );
  url.searchParams.set("key", key);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("empty completion");
  return text;
}

/** Gemini sometimes wraps JSON in fences or prose — be forgiving. */
function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
