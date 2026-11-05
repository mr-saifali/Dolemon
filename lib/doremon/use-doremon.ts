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
import { OFFLINE_NOTICE, isOfflineNotice, offlineReason } from "./offline";
import { doremonFetch } from "./api";
import type { DoremonMemory, DoremonMessage } from "./types";
import { emptyMemory } from "./types";

const uid = () => `dm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

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
        if (!isOfflineNotice(text)) saveDoremonMessages(conversationId, next);
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
    setDoremonMessages(loadDoremonMessages(conversationId).filter((m) => !isOfflineNotice(m.text)));
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
      let lastDetail: string | null = null;
      let retryAfter: number | null = null;
      let quotaScope: "day" | "minute" | "unknown" = "unknown";
      if (remote) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 50_000);
        try {
          const res = await doremonFetch({ action: "ask", me, partner, recent, memory: memoryRef.current, question }, controller.signal);
          const data = (await res.json()) as { ok?: boolean; answer?: string; detail?: string; error?: string; retryAfterSeconds?: number | null; quotaScope?: "day" | "minute" | "unknown" };
          lastDetail = (data.error === "QUOTA" || data.error === "MODEL_QUOTA") ? data.error : data.detail ?? data.error ?? null;
          retryAfter = data.retryAfterSeconds ?? null;
          quotaScope = data.quotaScope ?? "unknown";
          if (res.ok && data.ok && data.answer) answer = data.answer;
        } catch (err) {
          lastDetail = err instanceof Error && err.message === "DOREMON_AUTH_REQUIRED" ? "AUTH_REQUIRED" : err instanceof Error && err.name === "AbortError" ? "timeout" : "NETWORK";
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!answer) {
        if (remote) {
          // No canned demo answers in remote mode — an honest status WITH
          // THE REASON, so Doremon never parrots a scripted line while his
          // brain is down.
          const reason = offlineReason(lastDetail, retryAfter, quotaScope);
          answer = OFFLINE_NOTICE + (reason ? ` (${reason})` : "");
        } else {
          // Pure demo mode (no backend at all): the pocket brain IS the brain.
          answer = localAsk(question, memoryRef.current, recent);
        }
      }

      pushDoremon("answer", answer);
      setThinking(false);
    },
    [brainMessages, me, partner, pushDoremon, remote, thinking]
  );

  const status: DoremonStatus = thinking ? "thinking" : watching ? "watching" : "idle";

  return { doremonMessages, memory, thinking, status, ask };
}
