"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { previewFor, type ChatMessage } from "@/lib/thread";
import type { BrainMessage } from "./local-brain";
import { localAnalyze, localAsk } from "./local-brain";
import { loadDoremonMemory, loadDoremonMessages, saveDoremonMemory, saveDoremonMessages } from "./memory";
import type { DoremonAnalysis, DoremonMemory, DoremonMessage } from "./types";
import { emptyMemory } from "./types";

const uid = () => `dm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** the local brain is retried against Gemini again after this long */
const RETRY_AFTER_MS = 10 * 60_000;

let geminiState: { down: boolean; since: number } = { down: false, since: 0 };

export type DoremonStatus = "idle" | "watching" | "thinking";

export function useDoremon(
  conversationId: string,
  messages: ChatMessage[],
  { remote, me, partner }: { remote: boolean; me: string; partner: string }
) {
  const [memory, setMemory] = useState<DoremonMemory | null>(null);
  const [doremonMessages, setDoremonMessages] = useState<DoremonMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [watching, setWatching] = useState(false);

  const memoryRef = useRef<DoremonMemory | null>(null);
  const lastAnalyzedId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  const pushDoremon = useCallback(
    (kind: DoremonMessage["kind"], text: string) => {
      setDoremonMessages((prev) => {
        const next = [...prev, { id: uid(), kind, text, at: Date.now() }].slice(-40);
        saveDoremonMessages(conversationId, next);
        return next;
      });
    },
    [conversationId]
  );

  const commitMemory = useCallback(
    (next: DoremonMemory) => {
      memoryRef.current = next;
      setMemory(next);
      void saveDoremonMemory(conversationId, next, remote);
    },
    [conversationId, remote]
  );

  /* ------------------------------------------------ load memory + old messages */
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setDoremonMessages(loadDoremonMessages(conversationId));
    void loadDoremonMemory(conversationId, remote).then((mem) => {
      memoryRef.current = mem;
      setMemory(mem);
    });
  }, [conversationId, remote]);

  /* --------------------------------------------------------- the watcher */
  const humanMessages = messages.filter((m) => m.author === "me" || m.author === "them");
  const tail = humanMessages[humanMessages.length - 1];

  useEffect(() => {
    if (!tail || tail.id === lastAnalyzedId.current) return;
    setWatching(true);
    if (timer.current) clearTimeout(timer.current);
    // let the conversation settle a moment, then read the room
    timer.current = setTimeout(() => {
      lastAnalyzedId.current = tail.id;
      void runAnalysis();
    }, 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail?.id, conversationId]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const brainMessages = useCallback((): BrainMessage[] => {
    return humanMessages
      .slice(-16)
      .map((m) => ({ who: m.author === "me" ? ("me" as const) : ("them" as const), text: previewFor(m) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  async function geminiAnalyze(recent: BrainMessage[]): Promise<DoremonAnalysis | null> {
    try {
      const res = await fetch("/api/doremon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze",
          me,
          partner,
          recent,
          memory: memoryRef.current,
        }),
      });
      if (res.status === 503) {
        geminiState = { down: true, since: Date.now() };
        return null;
      }
      const data = (await res.json()) as { ok?: boolean; analysis?: GemAnalysis };
      if (!res.ok || !data.ok || !data.analysis) {
        geminiState = { down: true, since: Date.now() };
        return null;
      }
      return normalizeAnalysis(data.analysis, memoryRef.current);
    } catch {
      geminiState = { down: true, since: Date.now() };
      return null;
    }
  }

  const runAnalysis = async () => {
    const recent = brainMessages();
    if (recent.length === 0) return;

    let analysis: DoremonAnalysis | null = null;
    if (remote && (!geminiState.down || Date.now() - geminiState.since > RETRY_AFTER_MS)) {
      analysis = await geminiAnalyze(recent);
    }
    if (!analysis) {
      analysis = localAnalyze(recent, memoryRef.current);
    }

    // He only *listens* now: the record updates silently so a later /doremon
    // is still sharp. He no longer speaks up on his own — ever.
    commitMemory(analysis.memory);
    setWatching(false);
  };

  /* ------------------------------------------------------ /doremon mention */
  const ask = useCallback(
    async (question: string) => {
      if (thinking) return;
      setThinking(true);
      const recent = brainMessages();

      let answer: string | null = null;
      if (remote && (!geminiState.down || Date.now() - geminiState.since > RETRY_AFTER_MS)) {
        try {
          const res = await fetch("/api/doremon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ask",
              me,
              partner,
              recent,
              memory: memoryRef.current,
              question,
            }),
          });
          const data = (await res.json()) as { ok?: boolean; answer?: string };
          if (res.ok && data.ok && data.answer) answer = data.answer;
          else if (res.status === 503) geminiState = { down: true, since: Date.now() };
        } catch {
          geminiState = { down: true, since: Date.now() };
        }
      }
      if (!answer) answer = localAsk(question, memoryRef.current, recent);

      // a short beat so it feels like he thought, not a parrot
      await new Promise((r) => setTimeout(r, 700));
      pushDoremon("answer", answer);
      setThinking(false);
    },
    [brainMessages, me, partner, pushDoremon, remote, thinking]
  );

  const status: DoremonStatus = thinking ? "thinking" : watching ? "watching" : "idle";

  return { doremonMessages, memory, thinking, status, ask };
}

/** The loose JSON shape Gemini is asked to return. */
type GemAnalysis = {
  summary?: unknown;
  moodMine?: unknown;
  moodTheirs?: unknown;
  tension?: unknown;
  fight?: unknown;
  boring?: unknown;
  conflictTopic?: unknown;
  deepTopic?: unknown;
  memoryNote?: unknown;
  interventionLine?: unknown;
};

/** Gemini returns loose JSON — coerce it into a sane, complete memory. */
function normalizeAnalysis(raw: GemAnalysis | null | undefined, previous: DoremonMemory | null): DoremonAnalysis | null {
  if (!raw) return null;
  const now = Date.now();
  const base: DoremonMemory = previous ?? emptyMemory(now);
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, 220) : null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : null;

  const note = str(raw.memoryNote);
  const topic = str(raw.conflictTopic);
  const deep = str(raw.deepTopic);
  const fight = raw.fight === true;
  const topicSeen = topic != null && base.conflictTopics.includes(topic);
  const deepSeen = deep != null && base.deepTopics.includes(deep);

  const memory: DoremonMemory = {
    ...base,
    summary: str(raw.summary) ?? base.summary,
    notes: note && !base.notes.includes(note) ? [note, ...base.notes].slice(0, 20) : base.notes,
    conflictTopics:
      topic && !base.conflictTopics.includes(topic) ? [topic, ...base.conflictTopics].slice(0, 8) : base.conflictTopics,
    deepTopics:
      deep && !base.deepTopics.includes(deep) ? [deep, ...base.deepTopics].slice(0, 8) : base.deepTopics,
    moodMine: str(raw.moodMine) ?? base.moodMine,
    moodTheirs: str(raw.moodTheirs) ?? base.moodTheirs,
    tension: num(raw.tension) ?? base.tension,
    fightCount: fight && !topicSeen ? base.fightCount + 1 : base.fightCount,
    deepTalkCount: !fight && deep && !deepSeen ? base.deepTalkCount + 1 : base.deepTalkCount,
    lastInterventionAt: base.lastInterventionAt,
    watchedSince: base.watchedSince,
    updatedAt: now,
  };

  return {
    memory,
    fight,
    boring: raw.boring === true,
    interventionLine: str(raw.interventionLine),
  };
}
