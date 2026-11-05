/**
 * The personal OS — pure, dependency-free core.
 *
 * Dolemon has exactly one owner. This module holds the model of that owner
 * (the "Constitution"), the append-only event vocabulary, the derivation of
 * facts/promises/open loops from a transcript, the local draft reader, the
 * adaptive rules, the Labs registry and the living climate.
 *
 * Nothing here touches React, the network, or localStorage — `store.ts` puts
 * a reactive shell around it. Keeping it pure means every one of these ideas
 * is testable offline, with no Gemini key and no Supabase project.
 */

export type LexiconEntry = { term: string; means: string; synonyms: string[] };

export type PersonalProfile = {
  /** what the app calls you */
  name: string;
  /** an even softer name — used in greetings and by Doremon */
  nickname: string;
  city: string;
  timezone: string;
  /** the mix you actually speak — free text, fed to Doremon's prompt */
  language: string;
  languageNote: string;
  /** local hours (0-23) — the app goes quiet between them */
  quietFrom: number;
  quietTo: number;
  /** your four-note "self chord" (Hz) — every sound in the app is a variation */
  selfChord: number[];
  /** your two-person private dictionary */
  lexicon: LexiconEntry[];
  boundaries: {
    /** hard-wired false: Doremon can advise, never send or delete */
    aiMaySend: false;
    aiMayReadHistory: boolean;
    ambientSound: boolean;
    telemetry: boolean;
  };
  updatedAt: number;
};

export const DEFAULT_CHORD = [523.25, 659.25, 783.99, 1046.5];

export const DEFAULT_PROFILE: PersonalProfile = {
  name: "you",
  nickname: "",
  city: "Patna",
  timezone: "Asia/Calcutta",
  language: "Hinglish",
  languageNote: "Roman Hindi mixed with English. Mirror whoever is writing.",
  quietFrom: 23,
  quietTo: 7,
  selfChord: [...DEFAULT_CHORD],
  lexicon: [
    { term: "dil", means: "I feel this", synonyms: ["heart", "feel"] },
    { term: "scene", means: "the situation between us", synonyms: ["situation", "matter"] },
    { term: "vibe", means: "the mood right now", synonyms: ["mood", "feel"] },
  ],
  boundaries: {
    aiMaySend: false,
    aiMayReadHistory: true,
    ambientSound: true,
    telemetry: true,
  },
  updatedAt: 0,
};

export function sanitizeProfile(raw: unknown): PersonalProfile {
  const p = (raw ?? {}) as Partial<PersonalProfile>;
  const str = (v: unknown, fallback: string, max = 120) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;
  const hour = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(23, Math.round(v))) : fallback;
  const chord = Array.isArray(p.selfChord)
    ? p.selfChord
        .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 40 && n < 8000)
        .slice(0, 4)
        .map((n) => Math.round(n * 100) / 100)
    : [];
  const lexicon = Array.isArray(p.lexicon)
    ? p.lexicon
        .filter((e): e is LexiconEntry => Boolean(e) && typeof e.term === "string" && Boolean(e.term.trim()))
        .slice(0, 120)
        .map((e) => ({
          term: String(e.term).trim().slice(0, 60),
          means: String(e.means ?? "").trim().slice(0, 120),
          synonyms: (Array.isArray(e.synonyms) ? e.synonyms : [])
            .filter((s): s is string => typeof s === "string")
            .slice(0, 12)
            .map((s) => s.trim().slice(0, 60)),
        }))
    : [];
  return {
    name: str(p.name, DEFAULT_PROFILE.name, 60),
    nickname: str(p.nickname, "", 60),
    city: str(p.city, DEFAULT_PROFILE.city, 60),
    timezone: str(p.timezone, DEFAULT_PROFILE.timezone, 60),
    language: str(p.language, DEFAULT_PROFILE.language, 60),
    languageNote: str(p.languageNote, DEFAULT_PROFILE.languageNote, 240),
    quietFrom: hour(p.quietFrom, DEFAULT_PROFILE.quietFrom),
    quietTo: hour(p.quietTo, DEFAULT_PROFILE.quietTo),
    selfChord: chord.length === 4 ? chord : [...DEFAULT_CHORD],
    lexicon: lexicon.length ? lexicon : DEFAULT_PROFILE.lexicon.map((e) => ({ ...e, synonyms: [...e.synonyms] })),
    boundaries: {
      // Non-negotiable. A personal app may read everything, but it never acts
      // on your behalf without a tap.
      aiMaySend: false,
      aiMayReadHistory: p.boundaries?.aiMayReadHistory !== false,
      ambientSound: p.boundaries?.ambientSound !== false,
      telemetry: p.boundaries?.telemetry !== false,
    },
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
  };
}

/* -------------------------------------------------------------- greetings */

export function isQuietHour(profile: PersonalProfile, date = new Date()): boolean {
  const h = date.getHours();
  const { quietFrom: from, quietTo: to } = profile;
  if (from === to) return false;
  return from > to ? h >= from || h < to : h >= from && h < to;
}

export function greetingForProfile(profile: PersonalProfile, date = new Date()): string {
  const h = date.getHours();
  const base =
    h < 5 || h >= 21 || isQuietHour(profile, date)
      ? "Still up"
      : h < 12
        ? "Good morning"
        : h < 17
          ? "Good afternoon"
          : "Good evening";
  return profile.nickname ? `${base}, ${profile.nickname}` : base;
}

export function displayName(profile: PersonalProfile, fallback?: string | null): string {
  return profile.nickname || profile.name || fallback || "you";
}

/** The block appended to every Gemini system prompt, so the brain speaks to ONE human. */
export function personalContextForPrompt(profile: PersonalProfile | null): string {
  if (!profile) return "";
  const p = sanitizeProfile(profile);
  const words = p.lexicon
    .slice(0, 12)
    .map((e) => `${e.term} = ${e.means}${e.synonyms.length ? ` (${e.synonyms.join(", ")})` : ""}`)
    .join("; ");
  return [
    "ABOUT THE ONE PERSON YOU WORK FOR (follow this over any generic advice):",
    `Name: ${p.name}${p.nickname ? ` (call them ${p.nickname})` : ""}. City: ${p.city}. Timezone: ${p.timezone}.`,
    `Language: ${p.language}. ${p.languageNote}`,
    `Quiet hours: ${String(p.quietFrom).padStart(2, "0")}:00–${String(p.quietTo).padStart(2, "0")}:00 local. Never push them to reply during that window.`,
    words ? `Their private lexicon: ${words}. Use these words naturally, never explain them.` : "",
    "Boundaries: never claim to have sent, deleted, or scheduled anything. Advice only, one tap away from being ignored.",
    "This app has exactly one owner. Be specific to THEIR life, not to a generic couple.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* --------------------------------------------------------------- lexicon */

export function expandQuery(profile: PersonalProfile, query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = [q];
  for (const entry of profile.lexicon) {
    const term = entry.term.toLowerCase();
    const synonyms = entry.synonyms.map((s) => s.toLowerCase());
    const haystack = [term, ...synonyms, entry.means.toLowerCase()];
    if (haystack.some((s) => s.includes(q) || q.includes(s))) {
      out.push(term, ...synonyms);
    }
  }
  return Array.from(new Set(out.filter(Boolean))).slice(0, 10);
}

export type Autocomplete = { word: string; insert: string; means: string };

export function autocompleteFor(profile: PersonalProfile, text: string): Autocomplete[] {
  const word = text.split(/\s+/).pop()?.toLowerCase() ?? "";
  if (word.length < 2) return [];
  return profile.lexicon
    .flatMap((entry) => {
      const term = entry.term.toLowerCase();
      const candidates = [term, ...entry.synonyms.map((s) => s.toLowerCase())];
      return candidates
        .filter((candidate) => candidate.startsWith(word) && candidate !== word && candidate.length > word.length)
        .map((candidate) => ({ word, insert: term, means: entry.means }));
    })
    .filter((item, index, all) => all.findIndex((x) => x.insert === item.insert) === index)
    .slice(0, 3);
}

/* ------------------------------------------------------------ event spine */

export type EventKind =
  | "app.open"
  | "room.open"
  | "brain.open"
  | "message.sent"
  | "message.received"
  | "composer.typing"
  | "pulse.sent"
  | "pulse.received"
  | "presence.together"
  | "presence.apart"
  | "reaction"
  | "call"
  | "draft.whisper"
  | "draft.rewrite"
  | "memory.indexed"
  | "learn.applied"
  | "learn.undone"
  | "lab.toggle"
  | "loop.done";

export type PersonalEvent = {
  id: string;
  kind: EventKind;
  at: number;
  conversationId?: string;
  meta?: Record<string, string | number | boolean>;
};

export const EVENT_LABELS: Record<EventKind, string> = {
  "app.open": "Opened Dolemon",
  "room.open": "Opened the room",
  "brain.open": "Opened your brain",
  "message.sent": "Sent a message",
  "message.received": "Their message landed",
  "composer.typing": "Typed in the composer",
  "pulse.sent": "Sent a pulse",
  "pulse.received": "Felt a pulse",
  "presence.together": "Both here",
  "presence.apart": "One of you left",
  "reaction": "Reacted",
  "call": "Call event",
  "draft.whisper": "Read a draft before sending",
  "draft.rewrite": "Rewrote a draft",
  "memory.indexed": "Indexed the memory",
  "learn.applied": "Applied a learned change",
  "learn.undone": "Undid a learned change",
  "lab.toggle": "Flipped a lab switch",
  "loop.done": "Closed an open loop",
};

export function countEvents(events: PersonalEvent[], kind: EventKind, since = 0): number {
  return events.filter((e) => e.kind === kind && e.at >= since).length;
}

export function eventsBetween(events: PersonalEvent[], from: number, to: number, kind?: EventKind): PersonalEvent[] {
  return events.filter((e) => e.at >= from && e.at <= to && (!kind || e.kind === kind));
}

/* ------------------------------------------------------------- labs garden */

export const LAB_FLAGS = [
  { id: "home.room", label: "Home is a room", description: "A place instead of an inbox. Toggle 'List' any time.", default: true },
  { id: "draft.whisper", label: "Draft Whisper", description: "A quiet read on how a message will land, before you send.", default: true },
  { id: "sonic.identity", label: "Sonic identity", description: "Every sound is a variation of your four-note chord.", default: true },
  { id: "ambient.drone", label: "Ambient drone", description: "A barely-there tone while you're both in the room.", default: false },
  { id: "learn.hands", label: "Learns your hands", description: "Adapts to your rhythms — with a reason and an undo.", default: true },
  { id: "lexicon.autocomplete", label: "Private lexicon", description: "Your words complete themselves; search understands synonyms.", default: true },
  { id: "openLoops.chip", label: "Open loops chip", description: "Promises you made, quietly counted in the header.", default: true },
  { id: "memory.timeline", label: "Memory timeline", description: "Episodes, facts and promises from every conversation.", default: true },
  { id: "honesty.sources", label: "Honesty sources", description: "Tap any number to see the events behind it.", default: true },
  { id: "climate.wallpaper", label: "Mood weather", description: "The room's light follows the hour and the temperature.", default: true },
  { id: "live.pulses", label: "Real pulses", description: "Pulses travel on the live presence channel, in both modes.", default: true },
] as const;

export type LabId = (typeof LAB_FLAGS)[number]["id"];
export type Labs = Record<LabId, boolean>;

export function defaultLabs(): Labs {
  return Object.fromEntries(LAB_FLAGS.map((f) => [f.id, f.default])) as Labs;
}

export function sanitizeLabs(raw: unknown): Labs {
  const next = defaultLabs();
  if (raw && typeof raw === "object") {
    for (const flag of LAB_FLAGS) {
      const value = (raw as Record<string, unknown>)[flag.id];
      if (typeof value === "boolean") next[flag.id] = value;
    }
  }
  return next;
}

/* -------------------------------------------------------------- draft read */

export type Whisper = {
  tone: "easy" | "heavy" | "sharp" | "late" | "quiet";
  line: string;
  rewrites: { label: string; text: string }[];
};

export type WhisperContext = {
  quiet: boolean;
  hoursSinceTheirLastMessage: number | null;
  theirLastLine: string;
};

/** A local, quota-free read of a draft. It never sends and never calls a model. */
export function whisperFor(draft: string, context: WhisperContext): Whisper {
  const text = draft.trim();
  if (!text) return { tone: "easy", line: "", rewrites: [] };
  const sharp = /([!?]{2,}|\b(always|never|why do you|tum hamesha|hamesha|kabhi nahi|whatever|fine\.)\b|[A-Z]{6,})/i.test(text);
  const heavy = text.length > 180 || text.split(/[.!?]\s+/).length > 3;
  const softened = text
    .replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/\b(always|never|whatever)\b/gi, "sometimes")
    .replace(/\s+/g, " ")
    .trim();
  const opener = context.theirLastLine ? "Hey, " : "";
  const rewrites = [
    sharp ? { label: "Softer", text: `${opener}${softened.charAt(0).toLowerCase()}${softened.slice(1)}` } : null,
    heavy
      ? { label: "Shorter", text: `${text.split(/[.!?]/)[0].trim().slice(0, 120)}${text.includes("?") ? "?" : ""}` }
      : null,
    context.hoursSinceTheirLastMessage !== null && context.hoursSinceTheirLastMessage > 6
      ? { label: "Warmer", text: `${opener}${text.charAt(0).toLowerCase()}${text.slice(1)}` }
      : null,
  ].filter((r): r is { label: string; text: string } => Boolean(r && r.text !== text));

  if (context.quiet) {
    return { tone: "quiet", line: "It's your quiet hour. This will land softly — or wait for morning. Your call.", rewrites };
  }
  if (sharp) {
    return { tone: "sharp", line: "This reads sharper than you sound. One soft word changes how it lands.", rewrites };
  }
  if (heavy) {
    return { tone: "heavy", line: "A lot for one bubble. They usually answer short lines faster.", rewrites };
  }
  if (context.hoursSinceTheirLastMessage !== null && context.hoursSinceTheirLastMessage > 6) {
    return { tone: "late", line: "You're reopening after a while. A warm word first makes it easier.", rewrites };
  }
  return { tone: "easy", line: "Sounds like you. It'll probably land easy.", rewrites };
}

/* ------------------------------------------------------------ memory graph */

export type MemoryFact = {
  id: string;
  text: string;
  at: number;
  sourceMessageId?: string;
  kind: "fact" | "joke" | "promise" | "ritual";
};

export type OpenLoop = {
  id: string;
  text: string;
  at: number;
  sourceMessageId?: string;
  status: "open" | "done";
};

export type Episode = { day: string; count: number; headline: string; mood: string };

export type MemoryGraph = { facts: MemoryFact[]; openLoops: OpenLoop[]; episodes: Episode[] };

export const emptyGraph = (): MemoryGraph => ({ facts: [], openLoops: [], episodes: [] });

export type GraphMessage = { who: "me" | "them"; text: string; at?: number; id?: string };

const FACT_RE = /\b(my birthday|i (love|like|hate|prefer)|favourite|favorite|mera|meri|mujhe|i'm from|i work|i live|my (mom|dad|dog|cat|sister|brother))\b/i;
const JOKE_RE = /\b(haha|lol|inside joke|hamara joke|our word|always say|funny)\b/i;
const PROMISE_RE = /\b(i'll|i will|we'll|we will|let's|lets|kal |kal hi|promise|pakka|call (me|you|kar)|send (you|the|kar)|bhej|yaad dila|remind|plan|meet|milne|kar dunga|kar dungi)\b/i;

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Builds the long-term graph from the transcript. Runs locally on every
 * analysis pass — free, silent, and stored in the same `doremon_memory` jsonb
 * row (no migration). A mass-market messenger can't do this: it would have to
 * read every private message by default.
 */
export function extractGraph(messages: GraphMessage[], existing?: MemoryGraph | null, now = Date.now()): MemoryGraph {
  const prev = existing ?? emptyGraph();
  const facts = [...prev.facts];
  const loops = [...prev.openLoops];
  const byFact = new Set(facts.map((f) => norm(f.text)));
  const byLoop = new Set(loops.map((l) => norm(l.text)));
  const episodes = new Map<string, { count: number; headline: string; longest: number; warm: number; sharp: number }>();

  for (const m of messages) {
    const text = clip(m.text);
    if (!text || text === "…") continue;
    const at = typeof m.at === "number" ? m.at : now;
    const id = m.id || `g_${at}_${facts.length + loops.length}`;
    const day = dayKey(at);
    const bucket = episodes.get(day) ?? { count: 0, headline: text, longest: text.length, warm: 0, sharp: 0 };
    bucket.count += 1;
    if (text.length > bucket.longest) {
      bucket.longest = text.length;
      bucket.headline = text;
    }
    if (/\b(love|pyaar|miss|sweet|good night|yaad)\b/i.test(text)) bucket.warm += 1;
    if (/\b(fight|gussa|angry|ignore|problem)\b/i.test(text)) bucket.sharp += 1;
    episodes.set(day, bucket);

    const key = norm(text);
    if (FACT_RE.test(text) && !byFact.has(key)) {
      byFact.add(key);
      facts.push({ id: `f_${id}`, text, at, sourceMessageId: m.id, kind: "fact" });
    } else if (JOKE_RE.test(text) && !byFact.has(key)) {
      byFact.add(key);
      facts.push({ id: `f_${id}`, text, at, sourceMessageId: m.id, kind: "joke" });
    }
    if (PROMISE_RE.test(text) && text.length > 8 && !byLoop.has(key)) {
      byLoop.add(key);
      loops.push({ id: `l_${id}`, text, at, sourceMessageId: m.id, status: "open" });
    }
  }

  return {
    facts: facts.slice(-60),
    openLoops: loops.slice(-40),
    episodes: Array.from(episodes.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-60)
      .map(([day, b]) => ({
        day,
        count: b.count,
        headline: clip(b.headline, 110),
        mood: b.sharp > b.warm ? "sharp" : b.warm > 0 ? "warm" : "quiet",
      })),
  };
}

export function openLoopsOf(graph: MemoryGraph | null | undefined): OpenLoop[] {
  return (graph?.openLoops ?? []).filter((l) => l.status === "open");
}

export function withLoopDone(graph: MemoryGraph, id: string): MemoryGraph {
  return { ...graph, openLoops: graph.openLoops.map((l) => (l.id === id ? { ...l, status: "done" } : l)) };
}

/* ------------------------------------------------------- adaptive learnings */

export type Learning = {
  id: "quietGlow" | "compact" | "pulseFirst";
  title: string;
  why: string;
  action: string;
};

/** Every adaptation is derived from real events and can be undone. */
export function deriveLearnings(events: PersonalEvent[], profile: PersonalProfile, now = Date.now()): Learning[] {
  const week = now - 7 * 86_400_000;
  const recent = events.filter((e) => e.at >= week);
  const out: Learning[] = [];

  const opens = recent.filter((e) => e.kind === "app.open" || e.kind === "room.open");
  const quietOpens = opens.filter((e) => isQuietHour(profile, new Date(e.at)));
  if (opens.length >= 4 && quietOpens.length / opens.length >= 0.4) {
    out.push({
      id: "quietGlow",
      title: "Dim the room after dark",
      why: `${quietOpens.length} of your last ${opens.length} opens were in your quiet hours.`,
      action: "Lowers the glow and keeps sounds gentle after dark.",
    });
  }

  const messages = recent.filter((e) => e.kind === "message.sent" || e.kind === "message.received");
  const busiest = new Map<number, number>();
  for (const m of messages) {
    const hour = Math.floor(m.at / 3_600_000) * 3_600_000;
    busiest.set(hour, (busiest.get(hour) ?? 0) + 1);
  }
  const peak = Math.max(0, ...Array.from(busiest.values()));
  if (peak >= 8) {
    out.push({
      id: "compact",
      title: "Tighter bubbles",
      why: `You traded ${peak} messages in one hour — you read fast in bursts.`,
      action: "Switches the thread to compact spacing while the burst lasts.",
    });
  }

  const pulses = recent.filter((e) => e.kind === "pulse.sent").length;
  if (pulses >= 3) {
    out.push({
      id: "pulseFirst",
      title: "Put the pulse first",
      why: `You reached for a pulse ${pulses} times this week.`,
      action: "Moves the heart to the front of the composer tray.",
    });
  }
  return out;
}

/* ------------------------------------------------------------- the climate */

export type Climate = { gradient: string; label: string; glow: string };

/** The wallpaper is a function of the hour, the quiet window and the mood. */
export function climateFor(profile: PersonalProfile, date = new Date(), tension = 0): Climate {
  const h = date.getHours();
  const quiet = isQuietHour(profile, date);
  if (quiet) {
    return {
      label: "quiet hours",
      glow: "rgba(125,140,255,0.10)",
      gradient:
        "radial-gradient(ellipse at 20% 10%, rgba(84,96,220,0.20), transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(120,80,200,0.16), transparent 60%)",
    };
  }
  if (tension >= 6) {
    return {
      label: "warm front",
      glow: "rgba(255,120,90,0.14)",
      gradient:
        "radial-gradient(ellipse at 15% 15%, rgba(255,92,122,0.22), transparent 50%), radial-gradient(ellipse at 85% 65%, rgba(255,160,90,0.16), transparent 55%)",
    };
  }
  if (h < 11) {
    return {
      label: "morning light",
      glow: "rgba(255,190,120,0.10)",
      gradient:
        "radial-gradient(ellipse at 15% 10%, rgba(255,190,120,0.18), transparent 55%), radial-gradient(ellipse at 85% 70%, rgba(125,211,252,0.12), transparent 55%)",
    };
  }
  if (h < 18) {
    return {
      label: "open sky",
      glow: "rgba(125,211,252,0.10)",
      gradient:
        "radial-gradient(ellipse at 20% 15%, rgba(125,211,252,0.16), transparent 55%), radial-gradient(ellipse at 80% 80%, rgba(167,139,250,0.12), transparent 55%)",
    };
  }
  return {
    label: "evening rose",
    glow: "rgba(255,92,122,0.12)",
    gradient:
      "radial-gradient(ellipse at 15% 15%, rgba(255,92,122,0.20), transparent 52%), radial-gradient(ellipse at 85% 65%, rgba(167,139,250,0.14), transparent 55%)",
  };
}
