"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversationReadState,
  deleteMessage,
  editMessage,
  loadReactions,
  loadThread,
  listConversations,
  markThreadRead,
  postMessage,
  removeMyReaction,
  setMyReaction,
  typingBus,
  uploadChatMedia,
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

  if (row.kind === "call") {
    const lower = row.body.toLowerCase();
    return {
      id: row.id,
      author: mine ? "me" : "them",
      kind: "call",
      text: row.body,
      at: row.at,
      editedAt: row.editedAt ?? null,
      status: mine ? (pending ? "sending" : "delivered") : undefined,
      call: { type: lower.startsWith("video") ? "video" : "voice", durationMs: 0, missed: lower.includes("missed") },
    };
  }

  if (row.kind === "presence") {
    return {
      id: row.id,
      author: "system",
      kind: "presence",
      text: row.body,
      at: row.at,
      editedAt: row.editedAt ?? null,
    };
  }

  const media = row.mediaUrl
    ? {
        url: row.mediaUrl,
        name: row.mediaName ?? undefined,
        sizeBytes: row.mediaSize ?? undefined,
        durationMs: row.mediaDurationMs ?? undefined,
      }
    : undefined;

  if (row.kind === "image" || row.kind === "audio" || row.kind === "file") {
    return {
      id: row.id,
      author: mine ? "me" : "them",
      kind: row.kind,
      text:
        row.body ||
        (row.kind === "image" ? "Photo" : row.kind === "audio" ? "Voice note" : "File"),
      at: row.at,
      editedAt: row.editedAt ?? null,
      status: mine ? (pending ? "sending" : "delivered") : undefined,
      reactions: row.reactions,
      media,
    };
  }

  return {
    id: row.id,
    author: mine ? "me" : "them",
    kind: row.kind === "sticker" ? "sticker" : "text",
    text: row.kind === "sticker" ? "" : row.body,
    at: row.at,
    editedAt: row.editedAt ?? null,
    status: mine ? (pending ? "sending" : "delivered") : undefined,
    reactions: row.reactions,
    sticker: row.kind === "sticker" ? (sticker || "dil") : undefined,
  };
}

/**
 * Telegram's rule in one line: my messages at or before the partner's read
 * cursor are read — and the exact moment they opened it is the read time.
 */
function applyReadCursor(messages: ChatMessage[], readAt: number | null): ChatMessage[] {
  if (readAt == null) return messages;
  return messages.map((m) => {
    if (m.author !== "me" || m.at > readAt) return m;
    if (m.status === "read" && m.seenAt) return m;
    return { ...m, status: "read", seenAt: readAt };
  });
}

/** Media attached to a send. `dataUrl` renders instantly and is uploaded before insert. */
export type RemoteMediaOptions = {
  dataUrl?: string;
  /** already-uploaded public URL (keeps retries from re-uploading) */
  url?: string;
  name?: string;
  sizeBytes?: number;
  durationMs?: number;
  /** extension without the dot */
  ext?: string;
};

export type RemoteSendOptions = {
  kind?: "text" | "sticker" | "image" | "audio" | "file";
  sticker?: ReactionType;
  media?: RemoteMediaOptions;
};

/**
 * Live thread backed by Supabase: messages, reactions, typing and presence.
 * `shareReads` mirrors the "Read receipts" toggle — when off we still mark the
 * thread read for ourselves but never push our read cursor to the partner.
 */
export function useRemoteThread(
  conversationId: string,
  enabled = true,
  { shareReads = true }: { shareReads?: boolean } = {}
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [partner, setPartner] = useState<DbConversation | null>(null);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  /** the other person's read cursor — everything of mine at or before it is seen */
  const [partnerReadAt, setPartnerReadAt] = useState<number | null>(null);
  const bus = useRef<ReturnType<typeof typingBus> | null>(null);
  const pending = useRef<Map<string, { body: string; kind: RemoteSendOptions["kind"]; media?: RemoteMediaOptions }>>(new Map());
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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
        const [result, conversations, readAt] = await Promise.all([
          loadThread(conversationId),
          listConversations().catch(() => [] as DbConversation[]),
          conversationReadState(conversationId).catch(() => null),
        ]);
        if (cancelled) return;
        const myId = result.me;
        setMe(myId);
        setPartner(conversations.find((c) => c.id === conversationId) ?? null);
        setPartnerReadAt(readAt);
        setMessages(applyReadCursor(result.messages.map((row) => toChatMessage(row, myId)), readAt));
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
    const stop = watchMessages(conversationId, {
      onInsert: (row) => {
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
      },
      onUpdate: (row) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === row.id ? { ...m, text: row.body, editedAt: row.editedAt ?? null } : m))
        );
      },
      onDelete: (id) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      },
      onRead: (at) => {
        setPartnerReadAt((prev) => (prev == null || at > prev ? at : prev));
        setMessages((prev) => applyReadCursor(prev, at));
      },
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
    void markThreadRead(conversationId, shareReads);
  }, [ready, conversationId, enabled, shareReads]);

  const deliver = useCallback(
    async (id: string, body: string, kind: RemoteSendOptions["kind"], media?: RemoteMediaOptions) => {
      try {
        let finalUrl = media?.url;
        // Photo / voice / file: upload to storage first, then insert the row with the URL.
        if (media?.dataUrl && !finalUrl) {
          finalUrl = await uploadChatMedia(
            conversationId,
            media.dataUrl,
            media.ext ?? (kind === "image" ? "jpg" : kind === "audio" ? "webm" : "bin")
          );
          // remember the uploaded URL so a retry never re-uploads
          const queued = pending.current.get(id);
          if (queued) pending.current.set(id, { ...queued, media: { ...media, url: finalUrl, dataUrl: undefined } });
        }

        const row = await postMessage(
          conversationId,
          body,
          kind ?? "text",
          finalUrl
            ? { url: finalUrl, name: media?.name, sizeBytes: media?.sizeBytes, durationMs: media?.durationMs }
            : undefined
        );
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
    (text: string, options: RemoteSendOptions = {}) => {
      const kind: RemoteSendOptions["kind"] =
        options.kind === "sticker" || options.kind === "image" || options.kind === "audio" || options.kind === "file"
          ? options.kind
          : "text";
      const body =
        kind === "sticker"
          ? (options.sticker ?? "dil")
          : kind === "file"
            ? (options.media?.name ?? "File")
            : text.trim();
      if (!body && kind !== "sticker") return;

      const id = tmpId();
      pending.current.set(id, { body, kind, media: options.media });
      const optimistic = options.media?.dataUrl
        ? {
            url: options.media.dataUrl,
            name: options.media.name,
            sizeBytes: options.media.sizeBytes,
            durationMs: options.media.durationMs,
          }
        : options.media?.url
          ? {
              url: options.media.url,
              name: options.media.name,
              sizeBytes: options.media.sizeBytes,
              durationMs: options.media.durationMs,
            }
          : undefined;

      setMessages((prev) => [
        ...prev,
        {
          id,
          author: "me",
          kind: kind === "sticker" ? "sticker" : kind,
          text: kind === "sticker" ? "" : body,
          at: Date.now(),
          status: "sending",
          sticker: kind === "sticker" ? ((options.sticker ?? "dil") as ReactionType) : undefined,
          media: optimistic,
        },
      ]);
      void deliver(id, body, kind, options.media);
    },
    [deliver]
  );

  const retry = useCallback(
    (messageId: string) => {
      const queued = pending.current.get(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "sending" } : m)));
      if (queued) {
        void deliver(messageId, queued.body, queued.kind, queued.media);
        return;
      }
      const current = messages.find((m) => m.id === messageId);
      if (!current) return;
      if (current.kind === "sticker") {
        void deliver(messageId, current.text, "sticker");
        return;
      }
      if (current.media?.url) {
        void deliver(messageId, current.text, current.kind === "file" ? "file" : current.kind === "image" ? "image" : current.kind === "audio" ? "audio" : "text", {
          url: current.media.url,
          name: current.media.name,
          sizeBytes: current.media.sizeBytes,
          durationMs: current.media.durationMs,
        });
      } else {
        void deliver(messageId, current.text, "text");
      }
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
    // real messages are deleted in Postgres too; optimistic bubbles only exist locally
    if (!messageId.startsWith("tmp_")) void deleteMessage(messageId).catch(() => undefined);
  }, []);

  /** Rewrite my own text. Fails quietly for the other person's messages (RLS). */
  const edit = useCallback(async (messageId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const before = messagesRef.current.find((m) => m.id === messageId)?.text ?? "";
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: trimmed, editedAt: Date.now() } : m))
    );
    try {
      if (messageId.startsWith("tmp_")) return;
      const at = await editMessage(messageId, trimmed);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, editedAt: at } : m)));
    } catch (error) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: before } : m)));
      throw error;
    }
  }, []);

  return {
    ready,
    me,
    messages,
    typing,
    online,
    partnerReadAt,
    partnerName: partner?.partnerUsername ?? null,
    partnerAvatar: partner?.partnerAvatar ?? null,
    partnerAvatarUrl: partner?.partnerAvatarUrl ?? null,
    partnerLastAt: partner?.lastAt ?? null,
    partnerLastSeenAt: partner?.partnerLastSeen ?? null,
    send,
    react,
    clearMyReaction,
    retry,
    remove,
    edit,
    notifyTyping: () => bus.current?.ping(),
  };
}
