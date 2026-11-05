"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { previewFor, type ChatMessage } from "@/lib/thread";
import type { BrainMessage } from "./local-brain";
import { localAnalyze, localAsk } from "./local-brain";
import {
  loadDoremonMemory,
  loadDoremonMessages,
  loadDoremonStats,
  saveDoremonMemory,
  saveDoremonMessages,
} from "./memory";
import { localFinalize, viewStats } from "./insights";
import { OFFLINE_NOTICE } from "./offline";
import type { DoremonMemory, DoremonMessage } from "./types";
import { emptyMemory } from "./types";

const uid = () => `dm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** the local brain is retried against Gemini again after this long */
const RETRY_AFTER_MS = 10 * 60_000;

let geminiState: { down: boolean; since: number } = { down: false, since: 0 };

export type DoremonStatus = "idle" | "watching" | "thinking";

export function useDoremon(
  conversationId: string,
  messages: ChatMessage[],
  {
    remote,
    me,
    partner,
    meId = null,
    partnerId = null,
  }: {
    remote: boolean;
    me: string;
    partner: string;
    /** user ids — let the closing summary read the talking census */
    meId?: string | null;
    partnerId?: string | null;
  }
) {
  const [memory, setMemory] = useState<DoremonMemory | null>(null);
  const [doremonMessages, setDoremonMessages] = useState<DoremonMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [watching, setWatching] = useState(false);

  const memoryRef = useRef<DoremonMemory | null>(null);
  const lastAnalyzedId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushDoremon = useCallback(
    (kind: DoremonMessage["kind"], text: string) => {
      setDoremonMessages((prev) => {
        const next = [...prev, { id: uid(), kind, text, at: Date.now() }].slice(-40);
        // The offline notice is live feedback, not conversation — show it on
        // screen, but never let it pile up in the saved history.
        if (text !== OFFLINE_NOTICE) saveDoremonMessages(conversationId, next);
        return next;
      });
    },
    [conversationId]
  );

  const commitMemory = useCallback(
    (next: DoremonMemory) => {
      // keep the partner's handle in the record — so even a DELETED chat is
      // still nameable in Doremon's room
      const withPartner = next.partnerUsername === partner ? next : { ...next, partnerUsername: partner };
      memoryRef.current = withPartner;
      setMemory(withPartner);
      void saveDoremonMemory(conversationId, withPartner, remote);
    },
    [conversationId, remote, partner]
  );

  /* ------------------------------------------------ load memory + old messages */
  useEffect(() => {
    // drop any offline notices saved before they were excluded from history
    setDoremonMessages(loadDoremonMessages(conversationId).filter((m) => m.text !== OFFLINE_NOTICE));
    void loadDoremonMemory(conversationId, remote).then((mem) => {
      memoryRef.current = mem;
      setMemory(mem);
      // keep the partner's handle in the record, even before the first analysis
      if (mem && mem.partnerUsername !== partner) commitMemory(mem);
    });
  }, [conversationId, remote, partner, commitMemory]);

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

  // a live mirror of the transcript, so the closing summary (which runs from
  // an effect cleanup) always sees the FRESHEST lines, not a stale closure
  const recentRef = useRef<BrainMessage[]>([]);
  recentRef.current = brainMessages();

  /* --------------------------- the conversation just ended — close it out */
  // NOTE: deps are deliberately just [conversationId]. This cleanup must fire
  // ONLY when the user actually leaves the conversation (or the app) — not
  // when the partner's display name resolves, which happens a beat later.
  const finalizing = useRef(false);
  useEffect(() => {
    const conversation = conversationId;
    return () => {
      if (!remote || finalizing.current) return;
      const mem = memoryRef.current;
      if (!mem || !mem.summary) return; // nothing worth closing yet
      if (Date.now() - (mem.endedAt ?? 0) < 10 * 60_000) return; // already closed recently
      const partnerName = mem.partnerUsername ?? partner;
      finalizing.current = true;
      void (async () => {
        const stats = await loadDoremonStats(conversation, true).catch(() => null);
        const view = viewStats(stats, meId, partnerId);
        // NO hidden API calls: the closing record is written by the local
        // brain (free, client-side). Gemini only ever runs when the person
        // explicitly messages Doremon.
        const final = localFinalize(view, mem, partnerName);
        const next: DoremonMemory = {
          ...mem,
          finalSummary: final.summary,
          endedAt: Date.now(),
          endedNote: final.note || null,
          updatedAt: Date.now(),
        };
        memoryRef.current = next;
        setMemory(next);
        await saveDoremonMemory(conversation, next, true).catch(() => undefined);
        finalizing.current = false;
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const runAnalysis = async () => {
    const recent = brainMessages();
    if (recent.length === 0) return;

    // NO hidden API calls: the record is kept by the local brain — free,
    // client-side, silent. Gemini only runs when the person explicitly
    // messages Doremon (ask below).
    const analysis = localAnalyze(recent, memoryRef.current);

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
          // 12s hang-guard: one stalled call falls back locally without
          // disabling Gemini for the next 10 minutes.
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12_000);
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
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const data = (await res.json()) as { ok?: boolean; answer?: string };
          if (res.ok && data.ok && data.answer) answer = data.answer;
          else if (res.status === 503) geminiState = { down: true, since: Date.now() };
        } catch (err) {
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            geminiState = { down: true, since: Date.now() };
          }
        }
      }
      if (!answer) {
        if (remote) {
          // No canned demo answers in remote mode — an honest status instead,
          // so Doremon never parrots a scripted line while his brain is down.
          answer = OFFLINE_NOTICE;
        } else {
          // Pure demo mode (no backend at all): the pocket brain IS the brain.
          answer = localAsk(question, memoryRef.current, recent);
        }
      }

      // a short beat so it feels like he thought, not a parrot — kept snappy
      await new Promise((r) => setTimeout(r, 400));
      pushDoremon("answer", answer);
      setThinking(false);
    },
    [brainMessages, me, partner, pushDoremon, remote, thinking]
  );

  const status: DoremonStatus = thinking ? "thinking" : watching ? "watching" : "idle";

  return { doremonMessages, memory, thinking, status, ask };
}
