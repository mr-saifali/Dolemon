"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadReactions,
  loadThread,
  listConversations,
  markThreadRead,
  postMessage,
  removeMyReaction,
  setMyReaction,
  typingBus,
  watchMessages,
  watchReactions,
  type DbConversation,
  type DbMessage,
} from "@/lib/db";
import type { ReactionType } from "@/lib/reactions";
import type { ChatMessage } from "@/lib/thread";

const tmpId = () => `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function toChatMessage(row: DbMessage, me: string | null, pending = false): ChatMessage {
  const mine = row.senderId === me;
  const sticker = row.kind === "sticker" && (row.body as ReactionType);
  return {
    id: row.id,
    author: mine ? "me" : "them",
    kind: row.kind === "sticker" ? "sticker" : row.kind === "image" ? "image" : row.kind === "audio" ? "audio" : "text",
    text: row.kind === "sticker" ? "" : row.body,
    at: row.at,
    status: mine ? (pending ? "sending" : "delivered") : undefined,
    reactions: row.reactions,
    sticker: row.kind === "sticker" ? (sticker || "dil") : undefined,
  };
}

/** Live thread backed by Supabase: messages, reactions, typing and presence. */
export function useRemoteThread(conversationId: string, enabled = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [partner, setPartner] = useState<DbConversation | null>(null);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  const bus = useRef<ReturnType<typeof typingBus> | null>(null);
  const pending = useRef<Map<string, { body: string; kind: "text" | "sticker" }>>(new Map());

  const refreshReactions = useCallback(async () => {
    try {
      const map = await loadReactions(conversationId, me);
      setMessages((prev) =>
        prev.map((m) => ({ ...m, reactions: map.get(m.id) ?? m.reactions ?? [] }))
      );
    } catch {
      /* keep the optimistic state */
    }
  }, [conversationId, me]);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [{ messages: rows, me: myId }, conversations] = await Promise.all([
          loadThread(conversationId),
          listConversations().catch(() => [] as DbConversation[]),
        ]);
        if (cancelled) return;
        setMe(myId);
        setPartner(conversations.find((c) => c.id === conversationId) ?? null);
        setMessages(rows.map((row) => toChatMessage(row, myId)));
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled]);

  // realtime: new messages
  useEffect(() => {
    if (!enabled || !me) return;
    const stop = watchMessages(conversationId, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        // drop the matching optimistic bubble if this is our own send echoing back
        const withoutTmp = prev.filter(
          (m) =>
            !(
              m.id.startsWith("tmp_") &&
              m.author === "me" &&
              m.text === (row.kind === "sticker" ? "" : row.body)
            )
        );
        return [...withoutTmp, toChatMessage(row, me)];
      });
    });
    return stop;
  }, [conversationId, me, enabled]);

  // realtime: reactions
  useEffect(() => {
    if (!ready || !enabled) return;
    const stop = watchReactions(conversationId, () => void refreshReactions());
    return stop;
  }, [conversationId, ready, refreshReactions, enabled]);

  // typing + presence
  useEffect(() => {
    if (!me || !enabled) return;
    const b = typingBus(conversationId, me, (state) => {
      setTyping(state.typing);
      setOnline(state.online);
    });
    bus.current = b;
    return () => {
      b.stop();
      bus.current = null;
    };
  }, [conversationId, me, enabled]);

  useEffect(() => {
    if (!ready || !enabled) return;
    void markThreadRead(conversationId);
  }, [ready, conversationId, enabled]);

  const deliver = useCallback(
    async (id: string, body: string, kind: "text" | "sticker") => {
      try {
        const row = await postMessage(conversationId, body, kind);
        pending.current.delete(id);
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...toChatMessage(row, me), status: "delivered" } : m))
        );
      } catch {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "failed" } : m)));
      }
    },
    [conversationId, me]
  );

  const send = useCallback(
    (text: string, options: { kind?: "text" | "sticker"; sticker?: ReactionType } = {}) => {
      const kind = options.kind === "sticker" ? "sticker" : "text";
      const body = kind === "sticker" ? (options.sticker ?? "dil") : text.trim();
      if (!body) return;

      const id = tmpId();
      pending.current.set(id, { body, kind });
      setMessages((prev) => [
        ...prev,
        {
          id,
          author: "me",
          kind: kind === "sticker" ? "sticker" : "text",
          text: kind === "sticker" ? "" : body,
          at: Date.now(),
          status: "sending",
          sticker: kind === "sticker" ? ((options.sticker ?? "dil") as ReactionType) : undefined,
        },
      ]);
      void deliver(id, body, kind);
    },
    [deliver]
  );

  const retry = useCallback(
    (messageId: string) => {
      const queued = pending.current.get(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "sending" } : m)));
      if (queued) {
        void deliver(messageId, queued.body, queued.kind);
        return;
      }
      const current = messages.find((m) => m.id === messageId);
      if (current) void deliver(messageId, current.text, current.kind === "sticker" ? "sticker" : "text");
    },
    [deliver, messages]
  );

  const react = useCallback(
    (messageId: string, type: ReactionType) => {
      let removing = false;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const mine = (m.reactions ?? []).find((r) => r.by === "me");
          removing = mine?.type === type;
          const next = (m.reactions ?? []).filter((r) => r.by !== "me");
          return { ...m, reactions: removing ? next : [...next, { type, by: "me" as const }] };
        })
      );
      void (removing ? removeMyReaction(messageId) : setMyReaction(messageId, type))
        .catch(() => undefined)
        .finally(() => void refreshReactions());
    },
    [refreshReactions]
  );

  const clearMyReaction = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: (m.reactions ?? []).filter((r) => r.by !== "me") } : m
        )
      );
      void removeMyReaction(messageId)
        .catch(() => undefined)
        .finally(() => void refreshReactions());
    },
    [refreshReactions]
  );

  const remove = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    ready,
    me,
    messages,
    typing,
    online,
    partnerName: partner?.partnerUsername ?? null,
    partnerAvatar: partner?.partnerAvatar ?? null,
    partnerLastAt: partner?.lastAt ?? null,
    send,
    react,
    clearMyReaction,
    retry,
    remove,
    notifyTyping: () => bus.current?.ping(),
  };
}
