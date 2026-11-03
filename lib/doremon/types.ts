/**
 * Doremon — the resident AI friend of Dolemon.
 *
 * He watches every conversation, keeps a *compressed* record of each one
 * (moods, fight patterns, deep-talk moments), steps in when a fight starts or
 * the talk goes dry, and can be summoned anytime with `/doremon`.
 *
 * Live mode: analysis + answers come from Gemini Flash via /api/doremon.
 * Demo mode (or no API key): a local heuristic brain keeps Doremon alive.
 */

/** The compressed, long-lived record Doremon keeps for one conversation. */
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
