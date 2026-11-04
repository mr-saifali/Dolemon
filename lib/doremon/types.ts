/**
 * Doremon — the resident AI friend of Dolemon.
 *
 * He quietly observes every conversation and keeps a *compressed, private*
 * record of each one (moods, fight patterns, deep-talk moments, who talks
 * more and when). He never speaks in the chat on his own — he has his own
 * ROOM (app/doremon/<conversationId>) where a user can ask him anything:
 * memories, summaries, timing, willingness, and where the conversation is
 * heading. When a chat ends or is deleted, his record survives — even a
 * deleted chat keeps its summary in his pocket.
 *
 * Live mode: analysis + answers come from Gemini Flash via /api/doremon.
 * Demo mode (or no API key): a local heuristic brain keeps Doremon alive.
 */

/** The compressed, long-lived record Doremon keeps for one conversation.
 *  One per (conversation, user) — private to its owner. */
export type DoremonMemory = {
  /** max ~2 sentences, present tense — the state of this relationship */
  summary: string;
  /** compressed long-term notes: facts, promises, inside jokes, patterns */
  notes: string[];
  /** the topics this pair keeps fighting about */
  conflictTopics: string[];
  /** the topics where they go genuinely deep */
  deepTopics: string[];
  moodMine: string | null;
  moodTheirs: string | null;
  /** 0 = ice-cold, 10 = nuclear */
  tension: number | null;
  fightCount: number;
  deepTalkCount: number;
  /** epoch ms — when Doremon last stepped into the chat, anti-spam */
  lastInterventionAt: number | null;
  /** epoch ms — when Doremon started watching this conversation */
  watchedSince: number;
  updatedAt: number;
  /** partner's username — survives even after the chat itself is deleted */
  partnerUsername?: string | null;
  /** the closing summary Doremon wrote when the conversation last ended */
  finalSummary?: string | null;
  /** epoch ms — when the conversation last ended (user left the chat) */
  endedAt?: number | null;
  /** Doremon's warm closing note (Hinglish) when the conversation ended */
  endedNote?: string | null;
  /** this user's private Q&A with Doremon in his room (last 40) */
  chat?: RoomTurn[];
  /** local date "YYYY-MM-DD" of the stored daily briefing — one per day */
  dailyDay?: string | null;
  /** Doremon's daily briefing for `dailyDay` — yesterday / now / tomorrow */
  dailyBriefing?: string | null;
};

/** One exchange in Doremon's room — private to the user who asked. */
export type RoomTurn = {
  id: string;
  q: string;
  a: string;
  at: number;
};

/** The talking census of a conversation — output of `doremon_stats()`. */
export type DoremonUserStats = {
  total: number;
  lastAt: string;
  /** last 14 days: "YYYY-MM-DD" -> message count */
  perDay?: Record<string, number>;
  /** 24 buckets: hour -> message count */
  hours?: Record<string, number>;
};

export type DoremonStats = {
  total: number;
  firstAt: string | null;
  lastAt: string | null;
  /** keyed by user id (perspective-neutral — the app maps to me/them) */
  users?: Record<string, DoremonUserStats> | null;
  /** of the last 14 days, which user opened the day: user id -> days */
  whoStarts?: Record<string, number> | null;
};

export type DoremonMessageKind = "greeting" | "intervention" | "answer" | "note";

/** An ephemeral Doremon chat message (the *record* persists, not these). */
export type DoremonMessage = {
  id: string;
  kind: DoremonMessageKind;
  text: string;
  at: number;
};

/** One analysis pass over the recent conversation. */
export type DoremonAnalysis = {
  /** the updated compressed record */
  memory: DoremonMemory;
  fight: boolean;
  boring: boolean;
  /** Doremon's chat line when he should step in — null = stay quiet */
  interventionLine: string | null;
};

export const emptyMemory = (now = Date.now()): DoremonMemory => ({
  summary: "",
  notes: [],
  conflictTopics: [],
  deepTopics: [],
  moodMine: null,
  moodTheirs: null,
  tension: null,
  fightCount: 0,
  deepTalkCount: 0,
  lastInterventionAt: null,
  watchedSince: now,
  updatedAt: now,
});
