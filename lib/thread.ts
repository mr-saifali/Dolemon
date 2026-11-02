"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MessageAuthor = "me" | "them" | "system";
export type MessageKind = "text" | "presence";
export type MessageStatus = "sending" | "sent" | "delivered" | "read";

export type ChatMessage = {
  id: string;
  author: MessageAuthor;
  kind: MessageKind;
  text: string;
  at: number;
  status?: MessageStatus;
};

export type ThreadSeed = Omit<ChatMessage, "at"> & { minutesAgo: number };

const STORAGE_PREFIX = "dolemon:thread:";
const MINUTE = 60_000;

/** Demo threads, keyed by conversation id. Times are relative so they always look recent. */
const SEEDS: Record<string, ThreadSeed[]> = {
  c_aarohi: [
    { id: "s1", author: "system", kind: "presence", text: "You were both here together yesterday · 22 minutes", minutesAgo: 610 },
    { id: "s2", author: "them", kind: "text", text: "okay I finally watched that film you kept pushing", minutesAgo: 96 },
    { id: "s3", author: "me", kind: "text", text: "AND? was I right or was I right", minutesAgo: 94 },
    { id: "s4", author: "them", kind: "text", text: "you were right. annoyingly right.", minutesAgo: 93 },
    { id: "s5", author: "me", kind: "text", text: "I'm framing this message", minutesAgo: 92 },
    { id: "s6", author: "them", kind: "text", text: "reached home. call me when you're free? 🥺", minutesAgo: 3 },
    { id: "s7", author: "me", kind: "text", text: "calling in 10", minutesAgo: 2 },
  ],
  c_kabir: [
    { id: "k1", author: "them", kind: "text", text: "bhai that playlist was unreal", minutesAgo: 52 },
    { id: "k2", author: "me", kind: "text", text: "told you. track 4 is the one", minutesAgo: 50 },
    { id: "k3", author: "them", kind: "text", text: "on loop since yesterday", minutesAgo: 48 },
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

export function seedMessages(conversationId: string, now = Date.now()): ChatMessage[] {
  const seeds = SEEDS[conversationId] ?? [
    { id: "g1", author: "them" as const, kind: "text" as const, text: "hey 👋", minutesAgo: 30 },
  ];
  return seeds.map(({ minutesAgo, ...rest }) => ({ ...rest, at: now - minutesAgo * MINUTE }));
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
    window.localStorage.setItem(STORAGE_PREFIX + conversationId, JSON.stringify(messages.slice(-200)));
  } catch {
    /* storage full / private mode — the thread still works for this session */
  }
}

const uid = () => `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Thread state + persistence + the demo partner's auto-reply.
 * Everything here is local; swapping in a realtime subscription later keeps this shape.
 */
export function useThread(conversationId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ready, setReady] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const stored = read(conversationId);
    setMessages(stored ?? seedMessages(conversationId));
    setReady(true);
  }, [conversationId]);

  useEffect(() => {
    if (ready) write(conversationId, messages);
  }, [conversationId, messages, ready]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach(clearTimeout);
    };
  }, []);

  const patch = useCallback((id: string, next: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...next } : m)));
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id = uid();
      setMessages((prev) => [
        ...prev,
        { id, author: "me", kind: "text", text: trimmed, at: Date.now(), status: "sending" },
      ]);

      timers.current.push(setTimeout(() => patch(id, { status: "sent" }), 500));
      timers.current.push(setTimeout(() => patch(id, { status: "delivered" }), 900));
      timers.current.push(
        setTimeout(() => {
          patch(id, { status: "read" });
          setMessages((prev) => [
            ...prev,
            {
              id: uid(),
              author: "them",
              kind: "text",
              text: REPLIES[Math.floor(Math.random() * REPLIES.length)],
              at: Date.now(),
            },
          ]);
        }, 3400)
      );
      return id;
    },
    [patch]
  );

  /** Presence moments are timeline items, so the thread knows how to hold them. */
  const addMoment = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: uid(), author: "system", kind: "presence", text, at: Date.now() },
    ]);
  }, []);

  const resetDemo = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_PREFIX + conversationId);
    }
    setMessages(seedMessages(conversationId));
  }, [conversationId]);

  return { messages, send, addMoment, resetDemo, ready };
}

/** Groups messages into day buckets for the timeline dividers. */
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

  if (sameDay(date, now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
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

/** Consecutive same-author bubbles read as one block. */
export function isGrouped(prev: ChatMessage | undefined, current: ChatMessage) {
  if (!prev || prev.kind !== current.kind) return false;
  if (prev.author !== current.author) return false;
  return current.at - prev.at < 3 * MINUTE;
}
