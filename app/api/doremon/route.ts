import { NextResponse, type NextRequest } from "next/server";
import {
  ANALYZE_INSTRUCTIONS,
  ASK_INSTRUCTIONS,
  DAILY_INSTRUCTIONS,
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
  action: "analyze" | "ask" | "roomAsk" | "finalize" | "daily";
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
  /** action "daily" only: the last 24 hours of the chat, pre-sliced client-side */
  yesterday?: { who: "me" | "them"; text: string }[];
  /** action "daily" only: local date "YYYY-MM-DD" of the briefing */
  day?: string | null;
};

const ok = (payload: unknown) => NextResponse.json(payload);

/** Google rejected the API key itself (400/401/403) — a different, diagnosable
 *  failure from "unreachable". The client can then say *why* the brain is down. */
class GeminiKeyError extends Error {}

/** The key is fine, but THIS MODEL isn't available to it (404 "model is not
 *  found for API key"). The model chain walks past these. */
class GeminiModelError extends Error {}

/* ------------------------------------------------------------------ */
/* GET /api/doremon — the brain self-check.                           */
/* A 1-token call that answers: is there a key, does Google accept it,*/
/* and is the network open? The room header chip uses it on mount so  */
/* the status is true BEFORE the first question, and it is the way to */
/* verify a deployed key in seconds. Cached 60s so opening the room   */
/* repeatedly does not burn tokens.                                   */
/* ------------------------------------------------------------------ */

let pingCache: { at: number; body: Record<string, unknown>; status: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (pingCache && now - pingCache.at < 60_000) {
    return NextResponse.json(pingCache.body, { status: pingCache.status });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    await generateContent(key, model, "You are a liveness probe. Reply with exactly one word.", "ping", false, "ping");
    // report the model the key actually proved out on (may differ from the
    // configured one when the key is scoped to a different flash model)
    pingCache = { at: now, body: { ok: true, model: provenModel ?? model }, status: 200 };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (error instanceof GeminiKeyError) {
      pingCache = { at: now, body: { ok: false, error: "BAD_KEY", detail: msg.slice(0, 200) }, status: 401 };
    } else if (error instanceof GeminiModelError) {
      // longer slice: the [model list: …] diagnostic note is appended last
      pingCache = { at: now, body: { ok: false, error: "MODEL", detail: msg.slice(0, 320) }, status: 502 };
    } else {
      pingCache = { at: now, body: { ok: false, error: "NETWORK", detail: msg.slice(0, 120) }, status: 502 };
    }
  }
  return NextResponse.json(pingCache.body, { status: pingCache.status });
}

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

  const actions = ["analyze", "ask", "roomAsk", "finalize", "daily"] as const;
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[doremon] gemini failure:", msg);
    if (error instanceof GeminiKeyError) {
      // The key was read but Google refused it — tell the client exactly that.
      return NextResponse.json({ ok: false, error: "BAD_KEY", detail: msg.slice(0, 200) }, { status: 401 });
    }
    if (error instanceof GeminiModelError) {
      // Key is fine but none of the flash models in the chain are allowed to it.
      return NextResponse.json({ ok: false, error: "MODEL", detail: msg.slice(0, 200) }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "GEMINI", detail: msg.slice(0, 200) }, { status: 502 });
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

  if (body.action === "daily") {
    const yesterday = compactTranscript(body.yesterday ?? [], body.me, body.partner, 12);
    return {
      system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon in his private room, writing the daily briefing for "${body.me}" about their relationship with "${body.partner}".\n\n${DAILY_INSTRUCTIONS}`,
      user: `TODAY IS: ${body.day?.trim() || "an unknown date"}\n\nYOUR PRIVATE MEMORY OF THEM:\n${memoryBlock}\n\nTHE TALKING CENSUS:\n${census}\n\nYESTERDAY'S MESSAGES (last 24 hours, oldest → newest):\n${yesterday || "(the chat was silent for the last 24 hours)"}`,
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
  /** three lines, ~150 chars each */
  daily: 480,
  /** liveness probe — one word */
  ping: 8,
};

/* ------------------------------------------------------------------ */
/* Model chain — AI Studio keys can be scoped to specific models, so  */
/* a key that works on gemini-2.0-flash 404s on gemini-2.5-flash.     */
/* Walk the chain instead of going dark, and remember the first model */
/* the key proves it works on.                                        */
/* ------------------------------------------------------------------ */

const MODEL_FALLBACKS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
let provenModel: string | null = null;

function modelChain(configured: string): string[] {
  const chain: string[] = [];
  for (const m of [provenModel, configured, ...MODEL_FALLBACKS]) {
    if (m && !chain.includes(m)) chain.push(m);
  }
  return chain;
}

/* ------------------------------------------------------------------ */
/* Model discovery — Google retires and renames models, so a hardcoded */
/* chain can 404 even with a perfect key. When the static chain fails  */
/* with "model not found", ask Google which generateContent-capable    */
/* flash models THIS key can use, and try the newest of those.         */
/* ------------------------------------------------------------------ */

let modelListCache: { at: number; usable: string[]; total: number } | null = null;

function modelVersion(id: string): number {
  const m = id.match(/gemini-([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

async function discoverModels(key: string): Promise<{ usable: string[]; total: number }> {
  const now = Date.now();
  if (modelListCache && now - modelListCache.at < 10 * 60_000) return modelListCache;
  const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
  url.searchParams.set("key", key);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    const msg = `gemini ${res.status} (model list): ${text}`;
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new GeminiKeyError(msg);
    throw new Error(msg);
  }
  const data = (await res.json()) as {
    models?: { name?: string; supportedGenerationMethods?: string[] }[];
  };
  const all = data.models ?? [];
  // Ranking: plain flash (gemini-X-flash) → flash variants → any other
  // text-capable gemini model. Media/embed/preview/live models are excluded
  // (wrong job for chat). If Google has renamed everything, the third tier
  // still finds a model that can answer.
  const exact: string[] = [];
  const flashVariants: string[] = [];
  const anyText: string[] = [];
  for (const m of all) {
    const id = (m.name ?? "").replace(/^models\//, "");
    if (!/^gemini-/.test(id)) continue;
    if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
    if (/image|video|audio|tts|embed|preview|live|realtime/i.test(id)) continue;
    if (/^gemini-[\d.]+-flash$/.test(id)) exact.push(id);
    else if (/flash/.test(id)) flashVariants.push(id);
    else anyText.push(id);
  }
  const byNewest = (a: string, b: string) => modelVersion(b) - modelVersion(a);
  exact.sort(byNewest);
  flashVariants.sort(byNewest);
  anyText.sort(byNewest);
  modelListCache = { at: now, usable: [...exact, ...flashVariants, ...anyText].slice(0, 6), total: all.length };
  return modelListCache;
}

/** One attempt against one model — classifies Google's failure precisely. */
async function callGemini(
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
    const text = (await res.text().catch(() => "")).slice(0, 200);
    const msg = `gemini ${res.status} (${model}): ${text}`;
    // "models/X is not found for API key (id: …)" — the KEY is fine, the
    // MODEL isn't allowed to it. Checked BEFORE the key patterns, because
    // that message also contains the words "API key".
    if (res.status === 404 || /is not found for api key|model.*not found|not_found/i.test(text)) {
      throw new GeminiModelError(msg);
    }
    if (
      res.status === 400 ||
      res.status === 401 ||
      res.status === 403 ||
      /api key not valid|api_key_invalid|invalid_api_key|permission_denied/i.test(text)
    ) {
      throw new GeminiKeyError(msg);
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("empty completion");
  return text;
}

/**
 * Walk the model chain: a scoped key that 404s on one flash model (or hits
 * its per-model quota) moves to the next instead of going dark. A rejected
 * key stops immediately — no point walking with a dead key.
 */
async function generateContent(
  key: string,
  configuredModel: string,
  system: string,
  user: string,
  wantJson: boolean,
  action: string
): Promise<string> {
  let lastError: Error | null = null;
  const tried = new Set(modelChain(configuredModel));
  for (const model of modelChain(configuredModel)) {
    try {
      const text = await callGemini(key, model, system, user, wantJson, action);
      provenModel = model;
      return text;
    } catch (err) {
      if (err instanceof GeminiKeyError) throw err;
      const isModelProblem = err instanceof GeminiModelError;
      const isQuota = err instanceof Error && /^gemini 429/.test(err.message);
      if (!isModelProblem && !isQuota) throw err;
      lastError = err as Error;
    }
  }

  // Every known model name 404'd — Google has renamed/retired them. Ask
  // which models THIS key can actually use, and try the best of those.
  if (lastError instanceof GeminiModelError) {
    let discovered: string[] = [];
    let listNote: string;
    try {
      const listing = await discoverModels(key);
      discovered = listing.usable;
      listNote = `model list: ${listing.total} returned / ${listing.usable.length} usable${
        discovered.length ? ` [tried: ${discovered.slice(0, 3).join(", ")}]` : ""
      }`;
    } catch (err) {
      if (err instanceof GeminiKeyError) throw err;
      listNote = `model list failed: ${err instanceof Error ? err.message.slice(0, 100) : "unknown"}`;
    }
    for (const model of discovered.slice(0, 3)) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const text = await callGemini(key, model, system, user, wantJson, action);
        provenModel = model;
        return text;
      } catch (err) {
        if (err instanceof GeminiKeyError) throw err;
        const isModelProblem = err instanceof GeminiModelError;
        const isQuota = err instanceof Error && /^gemini 429/.test(err.message);
        if (!isModelProblem && !isQuota) throw err;
        lastError = err as Error;
      }
    }
    // the final error tells exactly what discovery saw — no more guessing
    throw new GeminiModelError(`${lastError.message} [${listNote}]`);
  }

  throw lastError ?? new Error("no models available");
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
