"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toggleReaction, type MessageReaction, type ReactionBy, type ReactionType } from "./reactions";

export type MessageAuthor = "me" | "them" | "system";
export type MessageKind = "text" | "presence" | "image" | "audio" | "call" | "sticker";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export type CallInfo = { type: "voice" | "video"; durationMs: number; missed?: boolean };

export type MediaInfo = { url: string; width?: number; height?: number; durationMs?: number };

export type QuotedMessage = { id: string; author: MessageAuthor; text: string };

/** Kept as an alias so older imports keep type-checking. */
export type Reaction = MessageReaction;

export type ChatMessage = {
  id: string;
  author: MessageAuthor;
  kind: MessageKind;
  text: string;
  at: number;
  status?: MessageStatus;
  media?: MediaInfo;
  replyTo?: QuotedMessage;
  /** epoch ms — the message was rewritten after sending */
  editedAt?: number | null;
  reactions?: MessageReaction[];
  call?: CallInfo;
  /** a standalone reaction sticker — no words at all */
  sticker?: ReactionType;
};

export type ThreadSeed = Omit<ChatMessage, "at"> & { minutesAgo: number };

const STORAGE_PREFIX = "dolemon:thread:";
const MINUTE = 60_000;
const MAX_STORED = 160;

const SEEDS: Record<string, ThreadSeed[]> = {
  c_aarohi: [
    { id: "s1", author: "system", kind: "presence", text: "You were both here together yesterday · 22 minutes", minutesAgo: 610 },
    { id: "s2", author: "them", kind: "text", text: "okay I finally watched that film you kept pushing", minutesAgo: 96 },
    { id: "s3", author: "me", kind: "text", text: "AND? was I right or was I right", minutesAgo: 94 },
    { id: "s4", author: "them", kind: "text", text: "you were right. annoyingly right.", minutesAgo: 93 },
    { id: "s5", author: "me", kind: "text", text: "I'm framing this message", minutesAgo: 92, reactions: [{ type: "aww", by: "them" }] },
    { id: "s6", author: "them", kind: "call", text: "Voice call · 4m 12s", minutesAgo: 40, call: { type: "voice", durationMs: 252_000 } },
    { id: "s7", author: "them", kind: "text", text: "reached home. call me when you're free? 🥺", minutesAgo: 3 },
    { id: "s8", author: "me", kind: "text", text: "calling in 10", minutesAgo: 2 },
  ],
  c_kabir: [
    { id: "k1", author: "them", kind: "text", text: "bhai that playlist was unreal", minutesAgo: 52 },
    { id: "k2", author: "me", kind: "text", text: "told you. track 4 is the one", minutesAgo: 50 },
    { id: "k3", author: "them", kind: "text", text: "on loop since yesterday", minutesAgo: 48 },
    { id: "k4", author: "me", kind: "call", text: "Missed voice call", minutesAgo: 30, call: { type: "voice", durationMs: 0, missed: true } },
  ],
  c_meher: [
    { id: "m1", author: "them", kind: "text", text: "are we still on for sunday?", minutesAgo: 200 },
    { id: "m2", author: "me", kind: "text", text: "obviously", minutesAgo: 195 },
  ],
  c_dev: [
    { id: "d1", author: "them", kind: "text", text: "sent a photo", minutesAgo: 1505 },
    { id: "d2", author: "me", kind: "text", text: "this is going straight to my camera roll", minutesAgo: 1500 },
  ],
  c_anaya: [
    { id: "a1", author: "them", kind: "text", text: "see you saturday 🌸", minutesAgo: 4405 },
    { id: "a2", author: "me", kind: "text", text: "wouldn't miss it", minutesAgo: 4402 },
  ],
};

const REPLIES = [
  "wait really??",
  "you're impossible 😌",
  "okay but you first",
  "i was literally just thinking that",
  "haha stop it",
  "sending you a hug",
];
const PHOTO_REPLIES = ["this is so pretty 😍", "saving this immediately", "okay this made my day"];
const VOICE_REPLIES = ["your voice >>>", "listened twice", "okay now i miss you"];

const pick = (list: string[]) => list[Math.floor(Math.random() * list.length)];

export function seedMessages(conversationId: string, now = Date.now()): ChatMessage[] {
  const seeds = SEEDS[conversationId] ?? [
    { id: "g1", author: "them" as const, kind: "text" as const, text: "hey 👋", minutesAgo: 30 },
  ];
  return seeds.map((s) => {
    const { minutesAgo, ...rest } = s;
    return { ...rest, at: now - minutesAgo * MINUTE };
  });
}

function read(conversationId: string): ChatMessage[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + conversationId);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : null;
  } catch {
    return null;
  }
}

function write(conversationId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + conversationId, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    /* quota — keep the session usable, drop persistence */
  }
}

const uid = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

type SendOptions = {
  kind?: MessageKind;
  media?: MediaInfo;
  replyTo?: QuotedMessage;
  sticker?: ReactionType;
};

export function useThread(conversationId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const channel = useRef<BroadcastChannel | null>(null);
  const fromRemote = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setReady(true);
      return;
    }
    const stored = read(conversationId);
    setMessages(stored ?? seedMessages(conversationId));
    setReady(true);
  }, [conversationId, enabled]);

  /**
   * Live across tabs — open the same thread twice and messages, reactions and ticks
   * follow each other. This is the same surface a Supabase Realtime channel plugs into.
   */
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`dolemon:thread:${conversationId}`);
    channel.current = ch;
    ch.onmessage = (event: MessageEvent) => {
      if (!Array.isArray(event.data)) return;
      fromRemote.current = true;
      setMessages(event.data as ChatMessage[]);
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!ready || !enabled) return;
    write(conversationId, messages);
    if (fromRemote.current) {
      fromRemote.current = false;
      return;
    }
    channel.current?.postMessage(messages);
  }, [conversationId, messages, ready, enabled]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const patch = useCallback((id: string, next: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }, []);

  const deliver = useCallback(
    (id: string, reply?: string | null) => {
      timers.current.push(setTimeout(() => patch(id, { status: "sent" }), 450));
      timers.current.push(setTimeout(() => patch(id, { status: "delivered" }), 900));
      timers.current.push(
        setTimeout(() => {
          patch(id, { status: "read" });
          // a `null` reply means "don't answer this one" — used for wordless stickers
          if (reply === null) return;
          setMessages((prev) => [
            ...prev,
            { id: uid(), author: "them", kind: "text", text: reply ?? pick(REPLIES), at: Date.now() },
          ]);
        }, 3400)
      );
    },
    [patch]
  );

  const send = useCallback(
    (text: string, options: SendOptions = {}) => {
      const trimmed = text.trim();
      if (!trimmed && !options.media && !options.sticker) return;
      const id = uid();
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      setMessages((prev) => [
        ...prev,
        {
          id,
          author: "me",
          kind: options.kind ?? "text",
          text: trimmed,
          at: Date.now(),
          status: offline ? "failed" : "sending",
          media: options.media,
          replyTo: options.replyTo,
          sticker: options.sticker,
        },
      ]);
      if (!offline) {
        const reply =
          options.kind === "sticker"
            ? null
            : options.kind === "image"
              ? pick(PHOTO_REPLIES)
              : options.kind === "audio"
                ? pick(VOICE_REPLIES)
                : undefined;
        deliver(id, reply);
      }
      return id;
    },
    [deliver]
  );

  const react = useCallback((messageId: string, type: ReactionType, by: ReactionBy = "me") => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, reactions: toggleReaction(m.reactions, type, by) } : m
      )
    );
  }, []);

  /** Remove whatever I cast on this message, if anything. */
  const clearMyReaction = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, reactions: (m.reactions ?? []).filter((r) => r.by !== "me") } : m
      )
    );
  }, []);

  /** Re-run delivery for a message that failed while offline. */
  const retry = useCallback(
    (messageId: string) => {
      patch(messageId, { status: "sending" });
      deliver(messageId);
    },
    [deliver, patch]
  );

  const remove = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  /** Rewrite my own words — the demo thread marks it the same way the live one does. */
  const edit = useCallback(async (messageId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, text: trimmed, editedAt: Date.now() } : m))
    );
  }, []);

  const addMoment = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: uid(), author: "system", kind: "presence", text, at: Date.now() }]);
  }, []);

  const addCall = useCallback((info: CallInfo) => {
    const label = info.missed
      ? `Missed ${info.type} call`
      : `${info.type === "video" ? "Video" : "Voice"} call · ${formatCallDuration(info.durationMs)}`;
    setMessages((prev) => [
      ...prev,
      { id: uid(), author: info.missed ? "them" : "me", kind: "call", text: label, at: Date.now(), call: info },
    ]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    write(conversationId, []);
  }, [conversationId]);

  const resetDemo = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_PREFIX + conversationId);
    setMessages(seedMessages(conversationId));
  }, [conversationId]);

  return {
    messages,
    send,
    react,
    clearMyReaction,
    retry,
    remove,
    edit,
    clear,
    addMoment,
    addCall,
    resetDemo,
    ready,
  };
}

/** Calls happen on their own route, so the timeline entry is written straight to storage. */
export function appendCallEvent(conversationId: string, info: CallInfo) {
  const base = read(conversationId) ?? seedMessages(conversationId);
  const label = info.missed
    ? `Missed ${info.type} call`
    : `${info.type === "video" ? "Video" : "Voice"} call · ${formatCallDuration(info.durationMs)}`;
  base.push({
    id: uid(),
    author: info.missed ? "them" : "me",
    kind: "call",
    text: label,
    at: Date.now(),
    call: info,
  });
  write(conversationId, base);
}

export function formatCallDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function groupByDay(messages: ChatMessage[]) {
  const groups: { key: string; label: string; items: ChatMessage[] }[] = [];
  const now = new Date();

  for (const m of messages) {
    const d = new Date(m.at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(d, now), items: [] };
      groups.push(group);
    }
    group.items.push(m);
  }
  return groups;
}

export function dayLabel(date: Date, now = new Date()) {
  const sameDay = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

  if (sameDay(date, now)) return "Aaj";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return "Kal";
  if (now.getTime() - date.getTime() < 7 * 86_400_000) {
    return date.toLocaleDateString("en-IN", { weekday: "long" });
  }
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function clockTime(at: number) {
  return new Date(at).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function isGrouped(prev: ChatMessage | undefined, current: ChatMessage) {
  if (!prev || prev.kind !== current.kind) return false;
  if (prev.author !== current.author) return false;
  if (current.kind === "call" || current.kind === "presence") return false;
  return current.at - prev.at < 3 * MINUTE;
}

export function previewFor(message: ChatMessage) {
  switch (message.kind) {
    case "image":
      return "📷 Photo";
    case "audio":
      return "🎙️ Voice note";
    case "call":
      return message.text;
    case "presence":
      return message.text;
    case "sticker":
      return "Reaction";
    default:
      return message.text;
  }
}
