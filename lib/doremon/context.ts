/** Legacy/no-sharing path: only fixed labels and bounded counts leave the device. No free text is a
 * safe field, even after names have been replaced. Counts are from the loaded
 * window only, not a claim about the complete conversation. */
export type Intent = "greeting" | "recap" | "reply" | "idea" | "stats" | "followup" | "other";
type Pack = { day: number; u1: number; u2: number };
export type SafePacket = { action: "ask" | "roomAsk" | "daily"; intent: Intent; language: "english" | "hinglish"; packs: Pack[]; history: Intent[]; incomplete: true };
const INTENTS: Intent[] = ["greeting", "recap", "reply", "idea", "stats", "followup", "other"];
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const intentValue = (v: unknown): Intent => INTENTS.includes(v as Intent) ? v as Intent : "other";

export function classifyIntent(input: unknown): Intent {
  if (typeof input !== "string") return "other";
  const q = input.toLowerCase().trim();
  if (/^(?:(?:hi+|hello+|hey+|namaste|namaskar|dore?mon|doraemon|kaise ho|kya haal hai|how are you|good (?:morning|evening|night))[,!?.🐱\s]*)+$/i.test(q)) return "greeting";
  if (/previous (?:answer|question)|you said|what about (?:that|it)|tell me more|tumne kaha|maine pucha/i.test(q)) return "followup";
  if (/\b(?:how many|count|statistics|stats|kitne|kitna)\b/i.test(q) && /\b(?:message|messages|chat|texts?|baat)\b/i.test(q)) return "stats";
  if (/\b(?:summari[sz]e|summary|recap|summarise|saaransh)\b/i.test(q)) return "recap";
  if (/\b(?:suggest|write|draft|kind|reply|jawab)\b/i.test(q) && /\b(?:reply|response|jawab)\b/i.test(q)) return "reply";
  if (/\b(?:idea|topic|conversation starter|kya baat)\b/i.test(q)) return "idea";
  return "other";
}

function packsFromRecent(raw: unknown, now = Date.now()): Pack[] {
  if (!Array.isArray(raw)) return [];
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const groups = new Map<number, Pack>();
  for (const row of raw.slice(-500)) {
    const r = record(row);
    if ((r.who !== "me" && r.who !== "them") || typeof r.at !== "number" || !Number.isFinite(r.at)) continue;
    const date = new Date(r.at); if (!Number.isFinite(date.getTime()) || r.at > now) continue;
    date.setHours(0, 0, 0, 0);
    const day = Math.round((today.getTime() - date.getTime()) / 86400000);
    if (day < 0 || day > 6) continue;
    const p = groups.get(day) ?? { day, u1: 0, u2: 0 };
    if (r.who === "me") p.u1 = Math.min(99, p.u1 + 1); else p.u2 = Math.min(99, p.u2 + 1);
    groups.set(day, p);
  }
  return Array.from(groups.values()).sort((a, b) => b.day - a.day);
}

/** Browser side: raw questions, chat and history are transformed locally. */
export function minimizeQuestionRequest(input: unknown): SafePacket {
  const source = record(input);
  const action = source.action === "ask" ? "ask" : source.action === "daily" ? "daily" : "roomAsk";
  const question = typeof source.question === "string" ? source.question : "";
  const intent = action === "daily" ? "recap" : classifyIntent(question);
  const language = /[\u0900-\u097f]|\b(?:kya|kaise|hai|hain|batao|bata|hum|hamari|maine|tumne|kal|baat|jawab)\b/i.test(question) ? "hinglish" : "english";
  const memory = record(source.memory);
  const history = Array.isArray(memory.chat) ? memory.chat.slice(-5).map((turn) => classifyIntent(record(turn).q)) : [];
  const packs = action === "daily" ? packsFromRecent(source.yesterday) : ["recap", "reply", "stats"].includes(intent) ? packsFromRecent(source.recent) : [];
  return { action, intent, language, packs, history, incomplete: true };
}

/** Server side: rebuild a packet from a closed schema, including legacy calls. */
export function sanitizePacket(input: unknown): SafePacket {
  const source = record(input);
  if (!("intent" in source)) return minimizeQuestionRequest(source);
  const action = source.action === "ask" ? "ask" : source.action === "daily" ? "daily" : "roomAsk";
  const seen = new Set<number>();
  const packs: Pack[] = [];
  for (const item of (Array.isArray(source.packs) ? source.packs : []).slice(0, 7)) {
    const p = record(item);
    if (!Number.isInteger(p.day) || (p.day as number) < 0 || (p.day as number) > 6 || seen.has(p.day as number)) continue;
    if (!Number.isInteger(p.u1) || !Number.isInteger(p.u2) || (p.u1 as number) < 0 || (p.u2 as number) < 0 || (p.u1 as number) > 99 || (p.u2 as number) > 99) continue;
    seen.add(p.day as number); packs.push({ day: p.day as number, u1: p.u1 as number, u2: p.u2 as number });
  }
  return { action, intent: intentValue(source.intent), language: source.language === "hinglish" ? "hinglish" : "english", packs, history: Array.isArray(source.history) ? source.history.slice(-5).map(intentValue) : [], incomplete: true };
}
