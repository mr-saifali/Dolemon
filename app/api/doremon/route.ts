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
export const dynamic = "force-dynamic";
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
/* A FREE model-catalog call (zero generateContent tokens) that       */
/* answers: is there a key, does Google accept it, and does it see    */
/* usable models? The room header chip uses it on mount so the status */
/* is true BEFORE the first question; the first real answer remains   */
/* the ground truth and updates the chip. Cached 60s.                 */
/* ------------------------------------------------------------------ */

let pingCache: { at: number; body: Record<string, unknown>; status: number } | null = null;

export async function GET(req: NextRequest) {
  // Diagnostic: ?models=1 returns the raw model catalog Google exposes for
  // this key, so we can see exactly what names exist without guessing.
  if (new URL(req.url).searchParams.get("models") === "1") {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
    try {
      const listing = await discoverModels(key);
      return NextResponse.json({
        ok: true,
        total: listing.total,
        usable: listing.usable,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ ok: false, error: error instanceof GeminiKeyError ? "BAD_KEY" : "ERROR", detail: msg.slice(0, 240) }, { status: 502 });
    }
  }

  // Diagnostic: ?probe=1 fires a tiny generateContent at the top usable
  // models and returns the RAW response, so we can see the exact shape
  // (parts, finishReason, block reasons) without guessing.
  // ?probe=N fires one real generation at the Nth usable model (1-based)
  // so each model in the fleet can be checked individually.
  const probeParam = new URL(req.url).searchParams.get("probe");
  if (probeParam && /^\d+$/.test(probeParam)) {
    const idx = Math.max(1, Number(probeParam)) - 1;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
    try {
      const listing = await discoverModels(key);
      const model = listing.usable[idx];
      if (!model) {
        return NextResponse.json(
          { ok: false, error: "MODEL", detail: `no model at position ${probeParam} (have ${listing.usable.length}: ${listing.usable.join(", ")})` },
          { status: 502 }
        );
      }
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
      url.searchParams.set("key", key);
      // Fast by design: ONE model, 8s hard timeout, minimal tokens.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: "Reply with exactly one word." }] }],
            // 3.x thinking models burn output budget on internal thought —
            // 256 keeps enough left for the visible word
            generationConfig: { temperature: 0.9, maxOutputTokens: 256 },
          }),
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const detail = err instanceof Error ? err.message.slice(0, 120) : "fetch failed";
        return NextResponse.json({ ok: false, model, status: 0, detail: `timed out after 8s (${detail})` }, { status: 504 });
      }
      clearTimeout(timer);
      const raw = (await res.text()).slice(0, 500);
      return NextResponse.json({ ok: res.ok, model, status: res.status, raw });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ ok: false, error: error instanceof GeminiKeyError ? "BAD_KEY" : "ERROR", detail: msg.slice(0, 240) }, { status: 502 });
    }
  }

  const now = Date.now();
  if (pingCache && now - pingCache.at < 60_000) {
    return NextResponse.json(pingCache.body, { status: pingCache.status });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
  }
  // FREE probe: the model-catalog call authenticates the key and confirms
  // usable models WITHOUT spending a single generateContent token. The old
  // one-word probe cost one of the free tier's ~20 daily requests EVERY
  // time a room opened — that alone could eat a third of the day's budget.
  // The first real question remains the ground-truth test (the room's
  // brain chip updates from it).
  try {
    const listing = await discoverModels(key);
    if (listing.usable.length === 0) {
      pingCache = {
        at: now,
        body: { ok: false, error: "MODEL", detail: `model list: ${listing.total} returned / 0 usable for this key` },
        status: 502,
      };
    } else {
      pingCache = { at: now, body: { ok: true, model: listing.usable[0] }, status: 200 };
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (error instanceof GeminiKeyError) {
      pingCache = { at: now, body: { ok: false, error: "BAD_KEY", detail: msg.slice(0, 200) }, status: 401 };
    } else {
      pingCache = { at: now, body: { ok: false, error: "NETWORK", detail: msg.slice(0, 220) }, status: 502 };
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
    return ok({ ok: true, answer: raw.slice(0, 4000) });
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
/* Gemini 3.x spends a large share of the output budget on its internal
   "thinking" before the visible answer. 300 tokens left only a handful of
   words of visible text — replies arrived cut off at 4-5 words. The free
   tier is limited by request COUNT (not tokens), so the headroom is free. */
const OUTPUT_CAPS: Record<string, number> = {
  analyze: 1000,
  finalize: 900,
  ask: 1200,
  roomAsk: 1200,
  /** three lines, ~150 chars each */
  daily: 1000,
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

/** A failure meaning "this model can't do it" — the chain should try the next. */
function isModelLevelError(err: unknown): boolean {
  if (err instanceof GeminiModelError) return true;
  if (err instanceof Error) {
    if (/^gemini 429/.test(err.message)) return true; // per-model quota
    if (/^gemini 5\d{2}/.test(err.message)) return true; // 5xx: this model is down/overloaded
    if (/^empty completion/.test(err.message)) return true; // 200 but nothing visible
    if (/^gemini timeout/.test(err.message)) return true; // hung — no response at all
  }
  return false;
}

/* A model that HUNG (no response) or 5xx'd is "dead" for a while, so the
   chain reaches a healthy model on the NEXT question instead of waiting it
   out again for 8+ seconds. */
const DEAD_MODEL_MS = 10 * 60_000;
const deadModels: Record<string, number> = {};

function isDeadModel(m: string): boolean {
  return (deadModels[m] ?? 0) > Date.now();
}
function markDeadModel(m: string) {
  deadModels[m] = Date.now() + DEAD_MODEL_MS;
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

  // Per-model hang guard: a stuck model must not stall the whole chain.
  // 5s is plenty for a healthy flash model (answers land in 1-4s); a hang
  // means "mark it dead and try the next model". Worst case with 3 dead
  // models is 15s, leaving room for a live model's answer inside the
  // client's wait.
  const controller = new AbortController();
  const hangTimer = setTimeout(() => controller.abort(), 5000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    clearTimeout(hangTimer);
    markDeadModel(model);
    throw new GeminiModelError(`gemini timeout (${model}): no response in 5s`);
  }
  clearTimeout(hangTimer);

  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    const msg = `gemini ${res.status} (${model}): ${text}`;
    if (res.status >= 500) markDeadModel(model); // 5xx — skip this model for a while
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
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const cand = data.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  // Gemini 3.x streams its reasoning as parts flagged `thought: true` —
  // those are internal, never part of the answer.
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) {
    const block = data.promptFeedback?.blockReason;
    const detail = block
      ? `safety-blocked (${block})`
      : parts.length
        ? `no visible text in ${parts.length} part(s), finish=${cand?.finishReason ?? "?"}`
        : `no candidates, finish=${cand?.finishReason ?? "none"}${block ? `, block=${block}` : ""}`;
    throw new Error(`empty completion (${model}): ${detail}`);
  }
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
    if (isDeadModel(model)) continue; // proven to hang/5xx — don't wait it out again
    try {
      const text = await callGemini(key, model, system, user, wantJson, action);
      provenModel = model;
      return text;
    } catch (err) {
      if (err instanceof GeminiKeyError) throw err;
      if (!isModelLevelError(err)) throw err;
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
    // the best LIVE models — a model that hung/5xx'd recently is skipped
    // so the chain reaches a healthy one on the first question
    const live = discovered.filter((m) => !isDeadModel(m));
    for (const model of live.slice(0, 3)) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const text = await callGemini(key, model, system, user, wantJson, action);
        provenModel = model;
        return text;
      } catch (err) {
        if (err instanceof GeminiKeyError) throw err;
        if (!isModelLevelError(err)) throw err;
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
