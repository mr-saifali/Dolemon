import { peakLabel, viewStats } from "./insights";
import type { DoremonStats } from "./types";

type Entry = { who: "me" | "them"; text: string };
type Turn = { q: string; a: string };
type QuestionContext = { summary?: string; notes?: string[]; recent?: Entry[]; stats?: string; history?: Turn[] };
export type QuestionPacket = { action: "ask" | "roomAsk"; question: string; context?: QuestionContext };
type Source = { action?: unknown; question?: unknown; meId?: unknown; partnerId?: unknown; memory?: unknown; recent?: unknown; stats?: unknown; context?: unknown };
const WORDS = new RegExp("[^\\p{L}\\p{M}\\p{N}]+", "u");
const STOP = new Set("what why how when where who which did do does have has is are am was were can could would should tell me you your i my us our we they their she he her him them about say said says message messages chat chats conversation recent last latest yesterday today tomorrow remember memory know ask please doremon kya kaise hai hain tha thi wo woh usne hum mera meri apna ka ki ke hai bata batao kal".split(" "));
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Local, deliberately conservative routing. Unknown intent receives no chat data. */
export function questionNeeds(question: string) {
  const q = question.toLowerCase().trim();
  const greeting = /^(?:(?:hi+|hello+|hey+|namaste|namaskar|hii+|hola|good\s+(?:morning|afternoon|evening|night)|dore?mon|doraemon|how\s+are\s+you|how(?:'s| is)\s+it\s+going|kaise\s+ho|kaisi\s+ho|kya\s+haal(?:\s+hai)?)\s*[,!?.🐱\s]*)+$/i.test(q);
  if (greeting || !q) return { recent: false, memory: false, stats: false, history: false };
  const chatReference = /\b(?:we|our|us|my partner|my (?:chat|conversation|messages)|chat|conversation|messages?|texts?|talk|baat|hum|hamari)\b/i.test(q) || /\b(?:she|he|they|her|him)\b/i.test(q) && /\b(?:said|say|wrote|bola|boli|kaha)\b/i.test(q);
  const stats = chatReference && /\b(?:how (?:many|often|frequently|long)|who (?:texts?|messages?|talks?|starts?)|count|frequency|timing|times?|hours?|statistics|stats|volume|kitn[aei]|kab|waqt)\b/i.test(q);
  return {
    stats,
    recent: !stats && chatReference && /\b(?:said|say|says|wrote|written|texts?|messages?|chat|conversation|talked|discussed|happened|last time|recent|yesterday|aaj|kal|bola|boli|kaha|kahi|baat)\b/i.test(q),
    memory: /\b(?:our relationship|my relationship|between us|our (?:history|chat|conversation)|my partner|my (?:girlfriend|boyfriend)|remember|memory|memories|hamara rishta|yaad)\b/i.test(q) || (chatReference && /\b(?:promise|promised|conflict|argument|fight|feelings|rishta|waada|ladai)\b/i.test(q)),
    history: /\b(?:you said|your (?:last|previous) (?:answer|reply|response)|i (?:asked|said)|previous (?:answer|question)|what about (?:that|it)|tell me more about (?:that|it)|you mentioned|tumne kaha|maine pucha)\b/i.test(q),
  };
}

function relevantTerms(question: string): string[] {
  return Array.from(new Set(question.toLowerCase().split(WORDS).filter((word) => word.length >= 3 && !STOP.has(word)))).slice(0, 8);
}
function relevant<T>(items: T[], question: string, read: (value: T) => string, max: number): T[] {
  const terms = relevantTerms(question);
  const matches = terms.length ? items.filter((item) => { const content = read(item).toLowerCase(); return terms.some((term) => content.includes(term)); }) : items;
  return matches.slice(-max);
}

/**
 * Called before the browser sends anything, and again on the server before
 * Gemini. It does not infer intent perfectly: uncertain questions get less
 * context and Doremon should ask for clarification rather than invent facts.
 */
export function minimizeQuestionRequest(input: unknown): QuestionPacket {
  const source = record(input) as Source;
  const action = source.action === "ask" ? "ask" : "roomAsk";
  const question = text(source.question, 2000);
  const needs = questionNeeds(question);
  const existing = record(source.context);
  const memory = record(source.memory);
  const context: QuestionContext = {};
  if (needs.memory) {
    const summary = text(existing.summary ?? memory.summary, 500);
    const terms = relevantTerms(question);
    const broad = /\b(?:our relationship|my relationship|between us|our history|hamara rishta)\b/i.test(question);
    if (summary && (broad || !terms.length || terms.some((term) => summary.toLowerCase().includes(term)))) context.summary = summary;
    const notes = existing.notes ?? memory.notes;
    if (Array.isArray(notes)) {
      const clean = notes.map((note) => text(note, 180)).filter(Boolean);
      const selected = relevant(clean, question, (note) => note, 3);
      if (selected.length) context.notes = selected;
    }
  }
  if (needs.recent) {
    const raw = existing.recent ?? source.recent;
    if (Array.isArray(raw)) {
      const clean: Entry[] = raw.slice(-80).map(record).filter((row) => row.who === "me" || row.who === "them").map((row) => ({ who: row.who as "me" | "them", text: text(row.text, 240) })).filter((row) => row.text);
      const selected = relevant(clean, question, (item) => item.text, 4);
      if (selected.length) context.recent = selected;
    }
  }
  if (needs.stats) {
    if (typeof existing.stats === "string") context.stats = text(existing.stats, 1000);
    else if (source.stats && typeof source.stats === "object") {
      const view = viewStats(source.stats as DoremonStats, text(source.meId, 80) || null, text(source.partnerId, 80) || null);
      const q = question.toLowerCase();
      const parts: string[] = [];
      if (/\b(?:starts?|opens?|shuru)\b/.test(q)) parts.push(`Days started in the last 14 days: you ${view.meStarts}, other person ${view.themStarts}.`);
      else if (/\b(?:timing|hours?|time|kab|waqt)\b/.test(q)) parts.push(`Peak activity: you ${peakLabel(view.mePeak)}, other person ${peakLabel(view.themPeak)}.`);
      else if (view.me && view.them) parts.push(`Message counts: you ${view.me.total}, other person ${view.them.total}.`);
      else if (typeof (source.stats as DoremonStats).total === "number") parts.push(`Total messages: ${(source.stats as DoremonStats).total}.`);
      if (parts.length) context.stats = parts.join(" ");
    }
  }
  if (needs.history) {
    const history = existing.history ?? memory.chat;
    if (Array.isArray(history)) {
      const clean = history.slice(-2).map(record).map((row) => ({ q: text(row.q, 300), a: text(row.a, 500) })).filter((row) => row.q && row.a);
      if (clean.length) context.history = clean;
    }
  }
  return { action, question, ...(Object.keys(context).length ? { context } : {}) };
}
