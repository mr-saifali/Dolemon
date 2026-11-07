"use client";

import { useSyncExternalStore } from "react";
import type { ChatThemeId } from "./chat-themes";

/** Per-chat state a premium messenger keeps: pinned, muted, unread, deleted. */
export type ChatMeta = {
  pinned?: boolean;
  muted?: boolean;
  unread?: number;
  deleted?: boolean;
  lastReadAt?: number;
  blocked?: boolean;
  /** Personal, device-local wallpaper override; absent means use the default. */
  chatTheme?: ChatThemeId;
};

type MetaMap = Record<string, ChatMeta>;

const KEY = "dolemon:chat-meta";
let cache: MetaMap = {};
let loaded = false;
const listeners = new Set<() => void>();

function read(): MetaMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MetaMap) : {};
  } catch {
    return {};
  }
}

function snapshot(): MetaMap {
  if (!loaded) {
    cache = read();
    loaded = true;
  }
  return cache;
}

function onStorage(event: StorageEvent) {
  if (event.key !== KEY && event.key !== null) return;
  cache = read();
  loaded = true;
  listeners.forEach((listener) => listener());
}

function subscribe(l: () => void) {
  if (typeof window !== "undefined" && listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(l);
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined" && listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function commit(next: MetaMap) {
  cache = next;
  loaded = true;
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function patchMeta(id: string, patch: Partial<ChatMeta>) {
  const current = snapshot();
  commit({ ...current, [id]: { ...current[id], ...patch } });
}

/** Drop only custom wallpaper overrides after the shared local image is removed. */
export function clearCustomChatThemes() {
  const current = snapshot();
  let changed = false;
  const next: MetaMap = {};
  for (const [id, meta] of Object.entries(current)) {
    if (meta.chatTheme === "custom") {
      const { chatTheme: _removed, ...rest } = meta;
      next[id] = rest;
      changed = true;
    } else next[id] = meta;
  }
  if (changed) commit(next);
}

export function markRead(id: string) {
  patchMeta(id, { unread: 0, lastReadAt: Date.now() });
}

export function useChatMeta() {
  return useSyncExternalStore(subscribe, snapshot, () => ({}) as MetaMap);
}

export function useChatMetaFor(id: string): ChatMeta {
  const all = useChatMeta();
  return all[id] ?? {};
}
