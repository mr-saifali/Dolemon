/** Opt-in, compact context. The same allowlist and limits run in browser and server. */
export const CONVERSATION_SHARING = "conversation-v1";
export const MAX_CONTEXT_BYTES = 9000;
const CONTENT_BYTES = 6000;
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const encoder = new TextEncoder();

function clip(value: unknown, maxBytes: number): string {
  if (typeof value !== "string") return "";
  const clean = value.replace(/\u0000/g, "").trim();
  let result = "", bytes = 0;
  for (const char of clean) {
    bytes += encoder.encode(char).length;
    if (bytes > maxBytes) break;
    result += char;
  }
  return result;
}

export type ConversationPacket = {
  sharing: typeof CONVERSATION_SHARING;
  action: "ask" | "roomAsk" | "daily";
  question: string;
  recent: { who: "me" | "them"; text: string }[];
  history: { q: string; a: string }[];
  note: string;
  incomplete: true;
};

/** Explicit sharing marker is required. Names, IDs, media objects and arbitrary fields never pass. */
export function conversationPacket(input: unknown): ConversationPacket | null {
  const source = record(input);
  if (source.sharing !== CONVERSATION_SHARING) return null;
  let budget = CONTENT_BYTES;
  const take = (value: unknown, cap: number) => {
    const text = clip(value, Math.min(cap, budget));
    budget -= encoder.encode(text).length;
    return text;
  };
  const action = source.action === "ask" ? "ask" : source.action === "daily" ? "daily" : "roomAsk";
  const question = take(source.question, 1200);
  const memory = record(source.memory);
  const note = take(source.note ?? memory.summary, 600);
  const history: ConversationPacket["history"] = [];
  const prior = source.history ?? memory.chat;
  for (const turn of (Array.isArray(prior) ? prior : []).slice(-3)) {
    const row = record(turn);
    const q = take(row.q, 200), a = take(row.a, 400);
    if (q && a) history.push({ q, a });
  }
  const raw = source.recent ?? source.yesterday;
  const candidates = (Array.isArray(raw) ? raw : []).slice(-50).map(record)
    .filter((row) => (row.who === "me" || row.who === "them") && typeof row.text === "string" && row.text.trim());
  // Preserve the latest eight and optionally retrieve older relevant excerpts,
  // without spending a second model call to summarize or retrieve.
  const terms = new Set(question.toLocaleLowerCase().match(new RegExp("[\\p{L}\\p{N}]{4,}", "gu")) ?? []);
  const latest = candidates.slice(-8);
  const relevant = candidates.slice(0, -8).filter((row) => {
    const text = (row.text as string).toLocaleLowerCase();
    return Array.from(terms).some((term) => text.includes(term));
  }).slice(-8);
  const selected = [...relevant, ...latest];
  // Allocate the remaining budget newest-first, then restore chronological order.
  const recent: ConversationPacket["recent"] = [];
  for (const row of selected.slice().reverse()) {
    const text = take(row.text, 500);
    if (text) recent.unshift({ who: row.who as "me" | "them", text });
  }
  const packet: ConversationPacket = { sharing: CONVERSATION_SHARING, action, question, recent, history, note, incomplete: true };
  // Defensive invariant even for Unicode/JSON-escaped input. Drop oldest context
  // before ever allowing an oversized external request.
  while (encoder.encode(JSON.stringify(packet)).length > MAX_CONTEXT_BYTES) {
    if (packet.recent.length) packet.recent.shift();
    else if (packet.history.length) packet.history.shift();
    else if (packet.note) packet.note = "";
    else { packet.question = clip(packet.question, 400); break; }
  }
  return packet;
}
