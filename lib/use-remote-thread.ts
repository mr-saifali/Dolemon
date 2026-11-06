"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  conversationReadState,
  INITIAL_THREAD_PAGE_SIZE,
  deleteMessage,
  editMessage,
  fetchMessageQuote,
  loadReactions,
  loadThread,
  latestMessageId,
  loadOlderMessages,
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
import { toast } from "sonner";
import { previewFor, type ChatMessage, type QuotedMessage } from "@/lib/thread";

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
      createdAt: row.createdAt,
      editedAt: row.editedAt ?? null,
      status: mine ? (pending ? "sending" : "sent") : undefined,
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
      createdAt: row.createdAt,
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
      createdAt: row.createdAt,
      editedAt: row.editedAt ?? null,
      status: mine ? (pending ? "sending" : "sent") : undefined,
      reactions: row.reactions,
      media,
      replyTo: row.replyTo ?? undefined,
    };
  }

  return {
    id: row.id,
    author: mine ? "me" : "them",
    kind: row.kind === "sticker" ? "sticker" : "text",
    text: row.kind === "sticker" ? "" : row.body,
    at: row.at,
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? null,
    status: mine ? (pending ? "sending" : "sent") : undefined,
    reactions: row.reactions,
    sticker: row.kind === "sticker" ? (sticker || "dil") : undefined,
    replyTo: row.replyTo ?? undefined,
  };
}

/**
 * Telegram's rule in one line: my messages at or before the partner's read
 * cursor are read — and the exact moment they opened it is the read time.
 */
function applyReadCursor(messages: ChatMessage[], readAt: number | null): ChatMessage[] {
  if (readAt == null || !Number.isFinite(readAt)) return messages;
  let changed = false;
  const updated = messages.map((m) => {
    if (m.author !== "me" || m.at > readAt || m.status === "sending" || m.status === "failed") return m;
    if (m.status === "read" && m.seenAt) return m;
    changed = true;
    return { ...m, status: "read" as const, seenAt: readAt };
  });
  return changed ? updated : messages;
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
  /** Telegram-style reply — this message quotes the given one */
  replyTo?: QuotedMessage | null;
};

/**
 * Live thread backed by Supabase: messages, reactions, typing and presence.
 * `shareReads` mirrors the "Read receipts" toggle — when off we still mark the
 * thread read for ourselves but never push our read cursor to the partner.
 */
export function useRemoteThread(
  conversationId: string,
  enabled = true,
  { shareReads = true, sharePresence = true, shareTyping = true }: { shareReads?: boolean; sharePresence?: boolean; shareTyping?: boolean } = {}
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [partner, setPartner] = useState<DbConversation | null>(null);
  const [typing, setTyping] = useState(false);
  const [online, setOnline] = useState(false);
  /** the other person's read cursor — everything of mine at or before it is seen */
  const [partnerReadAt, setPartnerReadAt] = useState<number | null>(null);
  /** the message being quoted (Telegram-style reply) while composing */
  const [replyTo, setReplyTo] = useState<QuotedMessage | null>(null);
  const bus = useRef<ReturnType<typeof typingBus> | null>(null);
  const pending = useRef<
    Map<string, { body: string; kind: RemoteSendOptions["kind"]; media?: RemoteMediaOptions; replyTo?: QuotedMessage | null }>
  >(new Map());
  const activeConversation = useRef(conversationId);
  activeConversation.current = conversationId;
  const messagesRef = useRef<ChatMessage[]>([]);
  const replyToRef = useRef<QuotedMessage | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    replyToRef.current = replyTo;
  }, [replyTo]);

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

  /* ------------------------------------------------------------- replying */
  /** Build the short quote preview for a message (Telegram-style). */
  const quoteFor = useCallback((m: ChatMessage): QuotedMessage => {
    const text = previewFor(m) || "…";
    return { id: m.id, author: m.author, text: text.slice(0, 140) };
  }, []);

  const startReply = useCallback(
    (m: ChatMessage) => setReplyTo(quoteFor(m)),
    [quoteFor]
  );

  const cancelReply = useCallback(() => setReplyTo(null), []);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    setLoadError(false);
    setHasOlder(false);
    setMessages([]);
    setMe(null);
    setPartner(null);
    setPartnerReadAt(null);
    // Metadata and read receipts must not delay opening the actual thread.
    void listConversations().then((conversations) => {
      if (!cancelled) setPartner(conversations.find((c) => c.id === conversationId) ?? null);
    }).catch(() => undefined);
    void conversationReadState(conversationId).then((at) => {
      if (!cancelled && at != null) setPartnerReadAt((prev) => prev == null ? at : Math.max(prev, at));
    }).catch(() => undefined);
    void loadThread(conversationId).then((result) => {
      if (cancelled) return;
      setMe(result.me);
      setHasOlder(result.messages.length >= INITIAL_THREAD_PAGE_SIZE);
      setMessages(result.messages.map((row) => toChatMessage(row, result.me)));
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    }).finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled, loadAttempt]);

  // The first request can fail before a Realtime channel is established.
  // Retry automatically when the device reconnects; don't clear a loaded thread.
  useEffect(() => {
    if (!enabled || !loadError) return;
    const reconnect = () => setLoadAttempt((n) => n + 1);
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [enabled, loadError]);

  useEffect(() => {
    if (partnerReadAt != null) setMessages((prev) => applyReadCursor(prev, partnerReadAt));
  }, [partnerReadAt, messages]);

  // realtime: new messages
  useEffect(() => {
    if (!enabled || !me) return;
    let active = true;
    let generation = 0;
    let reconciling = false;
    let reconcileAgain = false;
    let changed = new Set<string>();
    // Reconcile after joining/rejoining and periodically while visible, so a
    // missing publication or dropped websocket event cannot strand the view.
    const reconcile = () => {
        if (!active) return;
        if (reconciling) { reconcileAgain = true; return; }
        reconciling = true;
        const currentGeneration = ++generation;
        changed = new Set();
        void loadThread(conversationId).then((result) => {
          if (!active || generation !== currentGeneration) return;
          const events = changed;
          if (result.messages.length >= INITIAL_THREAD_PAGE_SIZE) setHasOlder(true);
          setMessages((prev) => {
            const stable = result.messages.filter((row) => !events.has(row.id)).map((row) => toChatMessage(row, result.me));
            const first = stable[0];
            const snapshotIds = new Set(result.messages.map((row) => row.id));
            const persisted = prev.filter((m) => !m.id.startsWith("tmp_") && !events.has(m.id));
            const newestPrevious = persisted[persisted.length - 1];
            const oldestSnapshot = result.messages[0];
            // If more than a whole window arrived while disconnected, joining
            // disjoint windows hides the intervening messages from pagination.
            // Drop the stale window instead; Load older can then traverse the gap.
            const hasGap = result.messages.length >= INITIAL_THREAD_PAGE_SIZE && oldestSnapshot && newestPrevious &&
              newestPrevious.at < oldestSnapshot.at && !persisted.some((m) => snapshotIds.has(m.id));
            const recentChanges = prev.filter((m) => m.id.startsWith("tmp_") ||
              (events.has(m.id) && (!hasGap || m.at >= oldestSnapshot.at)) ||
              (!hasGap && first && !snapshotIds.has(m.id) && m.at < first.at));
            return [...stable, ...recentChanges].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
          });
        }).catch(() => undefined).finally(() => {
          reconciling = false;
          if (active && reconcileAgain) { reconcileAgain = false; reconcile(); }
        });
    };
    const stop = watchMessages(conversationId, {
      onInsert: (row) => {
        if (!active) return;
        changed.add(row.id);
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          // A realtime echo can arrive before its POST response. Do not guess
          // which optimistic message it belongs to: identical simultaneous sends
          // may have different quotes. Reconcile by server ID on POST success.
          return [...prev, toChatMessage(row, me)];
        });
        // a reply just arrived (mine or theirs) — fetch the quoted message so the link renders
        if (row.replyToId) {
          const original = messagesRef.current.find((message) => message.id === row.replyToId);
          const quote = original ? Promise.resolve(quoteFor(original)) : fetchMessageQuote(row.replyToId, me);
          void quote.then((qt) => {
            if (!qt || !active) return;
            setMessages((prev) => prev.map((m) => (m.id === row.id && !m.replyTo ? { ...m, replyTo: qt } : m)));
          }).catch(() => undefined);
        }
      },
      onUpdate: (row) => {
        if (!active) return;
        changed.add(row.id);
        setMessages((prev) => {
          if (!prev.some((m) => m.id === row.id)) {
            return [...prev, toChatMessage(row, me)].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
          }
          return prev.map((m) => (m.id === row.id ? { ...m, text: row.body, editedAt: row.editedAt ?? null } : m));
        });
      },
      onDelete: (id) => {
        if (!active) return;
        changed.add(id);
        setMessages((prev) => prev.filter((m) => m.id !== id));
      },
      onSubscribed: reconcile,
      onRead: (at) => {
        if (!active || !shareReads) return;
        setPartnerReadAt((prev) => (prev == null || at > prev ? at : prev));
        setMessages((prev) => applyReadCursor(prev, at));
      },
    }, me);
    const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";
    let checking = false;
    const poll = () => {
      if (!isVisible() || checking) return;
      checking = true;
      void latestMessageId(conversationId).then((latest) => {
        if (!active) return;
        const persisted = messagesRef.current.filter((m) => !m.id.startsWith("tmp_"));
        if (latest !== (persisted[persisted.length - 1]?.id ?? null)) reconcile();
      }).catch(() => undefined).finally(() => { checking = false; });
      if (shareReads) void conversationReadState(conversationId).then((at) => {
        if (active && at != null) setPartnerReadAt((prev) => prev == null || at > prev ? at : prev);
      }).catch(() => undefined);
    };
    const resume = () => { if (isVisible()) { reconcile(); poll(); } };
    const timer = setInterval(poll, 5000);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
    if (typeof window !== "undefined") window.addEventListener("online", resume);
    return () => {
      active = false; clearInterval(timer); stop();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
      if (typeof window !== "undefined") window.removeEventListener("online", resume);
    };
  }, [conversationId, me, enabled, quoteFor, shareReads]);

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
    }, { sharePresence, shareTyping });
    bus.current = b;
    return () => {
      b.stop();
      bus.current = null;
    };
  }, [conversationId, me, enabled, sharePresence, shareTyping]);

  const markRead = useCallback(() => {
    if (ready && enabled) void markThreadRead(conversationId, shareReads).catch(() => undefined);
  }, [ready, enabled, conversationId, shareReads]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasOlder || !me) return;
    const first = messagesRef.current.find((m) => m.createdAt && !m.id.startsWith("tmp_"));
    if (!first?.createdAt) return;
    setLoadingOlder(true);
    try {
      const rows = await loadOlderMessages(conversationId, { createdAt: first.createdAt, id: first.id }, me);
      if (activeConversation.current !== conversationId) return;
      setHasOlder(rows.length >= 100);
      setMessages((prev) => {
        const existing = new Set(prev.map((message) => message.id));
        return [...rows.filter((row) => !existing.has(row.id)).map((row) => toChatMessage(row, me)), ...prev];
      });
    } catch {
      toast.error("Couldn't load older messages. Try again.");
    } finally {
      if (activeConversation.current === conversationId) setLoadingOlder(false);
    }
  }, [conversationId, me, hasOlder, loadingOlder]);

  const deliver = useCallback(
    async (
      id: string,
      body: string,
      kind: RemoteSendOptions["kind"],
      media?: RemoteMediaOptions,
      quote?: QuotedMessage | null
    ) => {
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
            : undefined,
          quote?.id ?? null
        );
        pending.current.delete(id);
        if (activeConversation.current !== conversationId) return;
        setMessages((prev) => {
          const echo = prev.find((m) => m.id === row.id);
          if (echo) {
            return prev.filter((m) => m.id !== id).map((m) =>
              m.id === row.id ? { ...m, replyTo: quote ?? m.replyTo } : m
            );
          }
          return prev.map((m) => (m.id === id ? { ...toChatMessage(row, me), status: "sent", replyTo: quote ?? m.replyTo } : m));
        });
      } catch (error) {
        if (activeConversation.current !== conversationId) { pending.current.delete(id); return; }
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: "failed" } : m)));
        if (error instanceof Error && /Replies aren't set up/.test(error.message)) toast.error(error.message);
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
      // a swipe-to-reply preview, if one is showing, travels with this message
      const quote = options.replyTo ?? replyToRef.current;
      pending.current.set(id, { body, kind, media: options.media, replyTo: quote ?? null });
      if (quote === replyToRef.current) cancelReply();
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
          replyTo: quote ?? undefined,
        },
      ]);
      void deliver(id, body, kind, options.media, quote ?? null);
    },
    [deliver, cancelReply]
  );

  const retry = useCallback(
    (messageId: string) => {
      const queued = pending.current.get(messageId);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, status: "sending" } : m)));
      if (queued) {
        void deliver(messageId, queued.body, queued.kind, queued.media, queued.replyTo ?? null);
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

  const remove = useCallback(async (messageId: string) => {
    const message = messagesRef.current.find((m) => m.id === messageId);
    if (!message || message.author !== "me") throw new Error("Only your own messages can be deleted.");
    if (messageId.startsWith("tmp_")) {
      if (message.status === "sending") throw new Error("Wait for sending to finish before deleting.");
      pending.current.delete(messageId);
    } else {
      await deleteMessage(messageId);
    }
    if (activeConversation.current === conversationId) setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, [conversationId]);

  /** Rewrite my own text. Fails quietly for the other person's messages (RLS). */
  const edit = useCallback(async (messageId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (messageId.startsWith("tmp_")) throw new Error("Wait until the message is sent before editing.");
    const previous = messagesRef.current.find((m) => m.id === messageId);
    const before = previous?.text ?? "";
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: trimmed, editedAt: Date.now() } : m))
    );
    try {
      const at = await editMessage(messageId, trimmed);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, editedAt: at } : m)));
    } catch (error) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: before, editedAt: previous?.editedAt } : m)));
      throw error;
    }
  }, []);

  return {
    ready,
    loadError,
    hasOlder,
    loadingOlder,
    loadOlder,
    markRead,
    reload: () => setLoadAttempt((n) => n + 1),
    me,
    messages,
    typing,
    online,
    partnerReadAt,
    partnerName: partner?.partnerUsername ?? null,
    partnerId: partner?.partnerId ?? null,
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
    replyTo,
    startReply,
    cancelReply,
    notifyTyping: () => bus.current?.ping(),
  };
}
