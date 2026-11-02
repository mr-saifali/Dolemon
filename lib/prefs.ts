"use client";

import { useSyncExternalStore } from "react";

export type Prefs = {
  /** let the other person see when you're in the room */
  showPresence: boolean;
  /** allow "thinking of you" pulses, in both directions */
  allowPulses: boolean;
  /** leave a warm glow in the room while you're away */
  lampOn: boolean;
  /** share the blue ticks — turn off and you also stop seeing theirs */
  readReceipts: boolean;
  /** show "typing…" in both directions */
  typingIndicator: boolean;
  /** vibration/haptic feedback on incoming pulses and calls */
  haptics: boolean;
};

const KEY = "dolemon:prefs";
const DEFAULT: Prefs = {
  showPresence: true,
  allowPulses: true,
  lampOn: false,
  readReceipts: true,
  typingIndicator: true,
  haptics: true,
};

let cache: Prefs = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function snapshot(): Prefs {
  if (!loaded) {
    cache = read();
    loaded = true;
  }
  return cache;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  const next = { ...snapshot(), [key]: value };
  cache = next;
  loaded = true;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT);
}

export function buzz(ms = 12) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
