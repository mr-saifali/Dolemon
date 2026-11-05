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
 * Model: GEMINI_MODEL (default gemini-2.5-flash-lite).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two bounded 20s model attempts + auth/catalog can exceed 30s.
// The browser has a 50s deadline; allow the server to return a real error.
export const maxDuration = 60;

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
 *  found for API key"). The configured model must be changed. */
class GeminiModelError extends Error {}
class GeminiQuotaError extends Error {
  constructor(public retryAfterSeconds: number | null, public noModelQuota = false, public scope: "day" | "minute" | "unknown" = "unknown") {
    super("Gemini rate or quota limit exceeded");
  }
}

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
      pingCache = { at: now, body: { ok: true, model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" }, status: 200 };
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
  // This endpoint spends a shared API quota. Never let anonymous callers use it.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return NextResponse.json({ ok: false, error: "AUTH_CONFIG" }, { status: 503 });
  const authorization = req.headers.get("authorization");
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) {
    return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  }
  try {
    const auth = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
      cache: "no-store", signal: AbortSignal.timeout(4000),
    });
    if (!auth.ok) {
      if (auth.status === 401 || auth.status === 403) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
      return NextResponse.json({ ok: false, error: "AUTH_UNAVAILABLE" }, { status: 503 });
    }
    const user = await auth.json();
    if (!user?.id) return NextResponse.json({ ok: false, error: "AUTH_REQUIRED" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "AUTH_UNAVAILABLE" }, { status: 503 });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

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

  try {
    const { system, user } = promptsFor(body);
    const wantJson = body.action === "analyze" || body.action === "finalize";
    const raw = await generateWithFallback(key, model, system, user, wantJson, body.action);
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
    if (error instanceof GeminiQuotaError) {
      const headers = error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
      return NextResponse.json({ ok: false, error: error.noModelQuota ? "MODEL_QUOTA" : "QUOTA", retryAfterSeconds: error.retryAfterSeconds, quotaScope: error.scope }, { status: 429, headers });
    }
    if (error instanceof GeminiKeyError) {
      // The key was read but Google refused it — tell the client exactly that.
      return NextResponse.json({ ok: false, error: "BAD_KEY", detail: msg.slice(0, 200) }, { status: 401 });
    }
    if (error instanceof GeminiModelError) {
      // The configured model is unavailable; do not spend more calls guessing.
      return NextResponse.json({ ok: false, error: "MODEL", detail: msg.slice(0, 200) }, { status: 502 });
    }
    return NextResponse.json({ ok: false, error: "GEMINI", detail: msg.slice(0, 200) }, { status: 502 });
  }
}

function promptsFor(body: RequestBody): { system: string; user: string } {
  // Compressed LOCALLY (empties dropped, long lines clipped, last 12 kept)
  // so we only spend tokens on signal before the API call.
  const transcript = compactTranscript(Array.isArray(body.recent) ? body.recent.slice(-12) : [], body.me, body.partner);

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
    const question = body.question?.trim().slice(0, 2000) || "";
    const chat = (body.memory as DoremonMemory | null)?.chat;
    const history = Array.isArray(chat)
      ? chat.slice(-4).filter((turn) => typeof turn?.q === "string" && typeof turn?.a === "string")
          .map((turn) => `User: ${turn.q.slice(0, 300)}\nDoremon: ${turn.a.slice(0, 500)}`).join("\n")
      : "";
    return {
      system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon in his private room, talking one-to-one with "${body.me}" about their relationship with "${body.partner}".\n\n${ROOM_ANALYST_INSTRUCTIONS}`,
      user: `YOUR PRIVATE MEMORY OF THEM:\n${memoryBlock}\n\nTHE TALKING CENSUS:\n${census}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation has no recent messages — answer from memory and the census)"}\n\nPREVIOUS PRIVATE EXCHANGES:\n${history || "(none)"}\n\n${
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

  const question = body.question?.trim().slice(0, 2000) || "";
  return {
    system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon, talking with the pair "${body.me}" and "${body.partner}" in their private chat. One of them is writing to you right now.\n\n${ASK_INSTRUCTIONS}`,
    user: `YOUR MEMORY OF THEM:\n${memoryBlock}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation is empty)"}\n\n${
      question ? `THEY SAID: ${question}` : "They just wrote /doremon with no question — give a short check-in: what you noticed, what you remember, one small suggestion."
    }`,
  };
}

/** Keep answers short and leave headroom for structured summaries. */
const OUTPUT_CAPS: Record<string, number> = {
  analyze: 768,
  finalize: 768,
  ask: 512,
  roomAsk: 512,
  daily: 512,
};

/* ------------------------------------------------------------------ */
/* Model discovery for the diagnostic GET endpoint. A listed model is */
/* not a guarantee that this project has free generation quota for it. */
/* ------------------------------------------------------------------ */

let modelListCache: { key: string; at: number; usable: string[]; total: number } | null = null;

function modelVersion(id: string): number {
  const m = id.match(/gemini-([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

async function discoverModels(key: string): Promise<{ usable: string[]; total: number }> {
  const now = Date.now();
  if (modelListCache && modelListCache.key === key && now - modelListCache.at < 10 * 60_000) return modelListCache;
  const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
  url.searchParams.set("key", key);
  url.searchParams.set("pageSize", "100");
  const res = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(2000) });
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
  modelListCache = { key, at: now, usable: [...exact, ...flashVariants, ...anyText], total: all.length };
  return modelListCache;
}

// Keep one proven fallback in a warm instance; never retry ordinary quota,
// timeout, or transient failures, which could waste the user's free requests.
let fallbackCache: { key: string; configured: string; model: string; until: number } | null = null;
async function generateWithFallback(
  key: string, configured: string, system: string, user: string, wantJson: boolean, action: string
): Promise<string> {
  const selected = fallbackCache && fallbackCache.key === key && fallbackCache.configured === configured && fallbackCache.until > Date.now()
    ? fallbackCache.model : configured;
  try {
    return await callGemini(key, selected, system, user, wantJson, action);
  } catch (error) {
    // Automatic recovery is limited to the default lightweight model, and
    // only for a missing model or Google's explicit zero model quota.
    if (selected !== configured || configured !== "gemini-2.5-flash-lite" ||
        !(error instanceof GeminiModelError || (error instanceof GeminiQuotaError && error.noModelQuota))) throw error;
    let models: string[];
    try { models = (await discoverModels(key)).usable; } catch { throw error; }
    const alternate = ["gemini-2.5-flash"].find((m) => m !== configured && models.includes(m));
    if (!alternate) throw error;
    try {
      const answer = await callGemini(key, alternate, system, user, wantJson, action);
      fallbackCache = { key, configured, model: alternate, until: Date.now() + 10 * 60_000 };
      return answer;
    } catch (fallbackError) {
      // If the alternative is also unavailable, retain the original reason.
      if (fallbackError instanceof GeminiModelError) throw error;
      throw fallbackError;
    }
  }
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
  // 2.5 Flash supports disabling optional thinking; save tokens and latency.
  if (/^gemini-2\.5-flash(?:-lite)?$/.test(model)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  };

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  );
  url.searchParams.set("key", key);

  // Do not abandon a slow but valid generation and start another one:
  // even an aborted request can consume a free-tier request.
  const controller = new AbortController();
  const hangTimer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  let responseText: string;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    responseText = await res.text();
  } catch {
    throw new Error(`gemini timeout or network error (${model})`);
  } finally {
    clearTimeout(hangTimer);
  }

  if (!res.ok) {
    const text = responseText.slice(0, 20000);
    const msg = `gemini ${res.status} (${model}): ${text.slice(0, 200)}`;
    if (res.status === 429) {
      let noModelQuota = false;
      let quotaScope: "day" | "minute" | "unknown" = "unknown";
      // Retry-After may be seconds or an HTTP date; Google may also return
      // google.rpc.RetryInfo in the JSON response body.
      const header = res.headers.get("retry-after");
      const seconds = header && /^\d+$/.test(header) ? Number(header) : null;
      const date = header && seconds === null ? Date.parse(header) : NaN;
      let retryAfter = seconds ?? (Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : null);
      try {
        const parsedError = JSON.parse(text)?.error;
        const details = parsedError?.details;
        // A zero model-specific allowance is not a temporary rate limit. Only
        // then is it useful to try another model; ordinary 429s are not retried.
        noModelQuota = Array.isArray(details) && details.some((d: { violations?: { quotaValue?: string | number; quotaDimensions?: { model?: string } }[] }) =>
          Array.isArray(d.violations) && d.violations.some((v) =>
            v.quotaDimensions?.model === model && String(v.quotaValue) === "0"
          )
        );
        const violations = Array.isArray(details) ? details.flatMap((d: { violations?: unknown }) => Array.isArray(d.violations) ? d.violations : []) : [];
        const quotaNames = violations.map((v: { quotaId?: unknown; quotaMetric?: unknown }) => `${v.quotaId ?? ""} ${v.quotaMetric ?? ""}`).join(" ");
        if (/perday|per_day/i.test(quotaNames)) quotaScope = "day";
        else if (/perminute|per_minute/i.test(quotaNames)) quotaScope = "minute";
        // Some Google responses omit the numeric quotaValue and only state
        // "limit: 0" in the error message. Only trust that when the structured
        // violation names this model; unrelated zero limits do not trigger a retry.
        if (!noModelQuota && typeof parsedError?.message === "string") {
          noModelQuota = parsedError.message.split("\n").some((line: string) =>
            /limit:\s*0(?:[\s,]|$)/i.test(line) && line.split(/model:\s*/i).slice(1).some((part: string) => part.trim().split(/[\s,]+/)[0] === model)
          ) && violations.some((v: { quotaDimensions?: { model?: string } }) => v.quotaDimensions?.model === model);
        }
        const retry = Array.isArray(details) ? details.find((d: { retryDelay?: unknown }) => typeof d.retryDelay === "string")?.retryDelay : null;
        const parsed = typeof retry === "string" ? Number.parseFloat(retry) : NaN;
        if (!retryAfter && Number.isFinite(parsed) && parsed > 0) retryAfter = Math.ceil(parsed);
      } catch { /* Retry hint is optional. */ }
      throw new GeminiQuotaError(retryAfter && retryAfter > 0 ? retryAfter : null, noModelQuota, quotaScope);
    }
    // "models/X is not found for API key (id: …)" — the KEY is fine, the
    // MODEL isn't allowed to it. Checked BEFORE the key patterns, because
    // that message also contains the words "API key".
    if (res.status === 404 || /is not found for api key|model.*not found|not_found/i.test(text)) {
      throw new GeminiModelError(msg);
    }
    if (
      res.status === 401 ||
      res.status === 403 ||
      /api key not valid|api_key_invalid|invalid_api_key|permission_denied/i.test(text)
    ) {
      throw new GeminiKeyError(msg);
    }
    throw new Error(msg);
  }

  const data = JSON.parse(responseText) as {
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
