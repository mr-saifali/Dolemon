"use client";

/**
 * Reactive shell around `core.ts`. Local-first by design: the source of truth
 * for who you are, what the app has seen, and which experiments are live is
 * this device — Supabase stays a sync relay for conversations, not for you.
 *
 * Every write is small, versioned and exportable (see /app/brain → Honesty).
 */

import { useSyncExternalStore } from "react";
import {
  DEFAULT_PROFILE,
  defaultLabs,
  deriveLearnings,
  EVENT_LABELS,
  LAB_FLAGS,
  sanitizeLabs,
  sanitizeProfile,
  type EventKind,
  type LabId,
  type Labs,
  type Learning,
  type PersonalEvent,
  type PersonalProfile,
} from "./core";

const PROFILE_KEY = "dolemon:personal:profile:v1";
const EVENTS_KEY = "dolemon:personal:events:v1";
const LABS_KEY = "dolemon:personal:labs:v1";
const DISMISSED_KEY = "dolemon:personal:dismissed:v1";
const CHANGELOG_KEY = "dolemon:personal:changelog:v1";

const MAX_EVENTS = 4000;

type ChangelogEntry = {
  id: string;
  at: number;
  flagId: LabId;
  label: string;
  enabled: boolean;
  note: string;
};

type Listener = () => void;
const listeners = new Set<Listener>();

function readRaw<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — keep the in-memory state, never break the chat */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------------------------------------- Constitution */

let profileCache: PersonalProfile | null = null;

export function readProfile(): PersonalProfile {
  if (profileCache) return profileCache;
  profileCache = sanitizeProfile(readRaw<unknown>(PROFILE_KEY, null));
  return profileCache;
}

export function patchProfile(patch: Partial<PersonalProfile>): PersonalProfile {
  const next = sanitizeProfile({ ...readProfile(), ...patch, updatedAt: Date.now() });
  profileCache = next;
  write(PROFILE_KEY, next);
  return next;
}

export function resetProfile(): PersonalProfile {
  const next = sanitizeProfile({ ...DEFAULT_PROFILE, updatedAt: Date.now() });
  profileCache = next;
  write(PROFILE_KEY, next);
  return next;
}

export function useProfile(): PersonalProfile {
  return useSyncExternalStore(subscribe, readProfile, () => DEFAULT_PROFILE);
}

/* --------------------------------------------------------------- event log */

let eventsCache: PersonalEvent[] | null = null;

export function readEvents(): PersonalEvent[] {
  if (eventsCache) return eventsCache;
  const raw = readRaw<unknown>(EVENTS_KEY, []);
  eventsCache = Array.isArray(raw)
    ? raw
        .filter((e): e is PersonalEvent => Boolean(e) && typeof e.kind === "string" && typeof e.at === "number")
        .slice(-MAX_EVENTS)
    : [];
  return eventsCache;
}

export function recordEvent(
  kind: EventKind,
  opts: { conversationId?: string; meta?: Record<string, string | number | boolean> } = {}
): void {
  // An explicit boundary: if you turn telemetry off, nothing is observed.
  if (!readProfile().boundaries.telemetry) return;
  const event: PersonalEvent = {
    id: uid("e"),
    kind,
    at: Date.now(),
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    ...(opts.meta ? { meta: opts.meta } : {}),
  };
  const next = [...readEvents(), event].slice(-MAX_EVENTS);
  eventsCache = next;
  write(EVENTS_KEY, next);
}

export function useEvents(): PersonalEvent[] {
  return useSyncExternalStore(subscribe, readEvents, () => [] as PersonalEvent[]);
}

export function clearEvents() {
  eventsCache = [];
  write(EVENTS_KEY, []);
}

export function eventLabel(kind: EventKind): string {
  return EVENT_LABELS[kind] ?? kind;
}

/* ---------------------------------------------------------------- Labs */

let labsCache: Labs | null = null;
let changelogCache: ChangelogEntry[] | null = null;

export function readLabs(): Labs {
  if (labsCache) return labsCache;
  labsCache = sanitizeLabs(readRaw<unknown>(LABS_KEY, null));
  return labsCache;
}

export function setFlag(id: LabId, enabled: boolean, note = "") {
  const next = { ...readLabs(), [id]: enabled };
  labsCache = next;
  write(LABS_KEY, next);
  const flag = LAB_FLAGS.find((f) => f.id === id);
  const entry: ChangelogEntry = {
    id: uid("log"),
    at: Date.now(),
    flagId: id,
    label: flag?.label ?? id,
    enabled,
    note,
  };
  changelogCache = [entry, ...readChangelog()].slice(0, 60);
  write(CHANGELOG_KEY, changelogCache);
  recordEvent("lab.toggle", { meta: { flag: id, enabled } });
}

export function killAllLabs() {
  const next = Object.fromEntries(LAB_FLAGS.map((f) => [f.id, false])) as Labs;
  labsCache = next;
  write(LABS_KEY, next);
  changelogCache = [
    { id: uid("log"), at: Date.now(), flagId: "home.room" as LabId, label: "Everything off", enabled: false, note: "Kill switch" },
    ...readChangelog(),
  ].slice(0, 60);
  write(CHANGELOG_KEY, changelogCache);
}

export function useLabs(): Labs {
  return useSyncExternalStore(subscribe, readLabs, defaultLabs);
}

export function readChangelog(): ChangelogEntry[] {
  if (changelogCache) return changelogCache;
  const raw = readRaw<unknown>(CHANGELOG_KEY, []);
  changelogCache = Array.isArray(raw) ? (raw as ChangelogEntry[]).slice(0, 60) : [];
  return changelogCache;
}

export function useChangelog(): ChangelogEntry[] {
  return useSyncExternalStore(subscribe, readChangelog, () => [] as ChangelogEntry[]);
}

export function setChangelogNote(id: string, note: string) {
  changelogCache = readChangelog().map((e) => (e.id === id ? { ...e, note: note.slice(0, 160) } : e));
  write(CHANGELOG_KEY, changelogCache);
}

/* ------------------------------------------------------------ learnings */

let dismissedCache: string[] | null = null;

function readDismissed(): string[] {
  if (dismissedCache) return dismissedCache;
  const raw = readRaw<unknown>(DISMISSED_KEY, []);
  dismissedCache = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  return dismissedCache;
}

export function dismissLearning(id: string) {
  dismissedCache = Array.from(new Set([...readDismissed(), id]));
  write(DISMISSED_KEY, dismissedCache);
  recordEvent("learn.undone", { meta: { learning: id } });
}

export function restoreLearning(id: string) {
  dismissedCache = readDismissed().filter((x) => x !== id);
  write(DISMISSED_KEY, dismissedCache);
}

export function useLearnings(): {
  learnings: Learning[];
  dismissed: Learning[];
  dismiss: (id: string) => void;
  restore: (id: string) => void;
} {
  const events = useEvents();
  const profile = useProfile();
  // Dismissed ids live in the same store, so this recomputes on every write.
  useSyncExternalStore(subscribe, readDismissed, () => [] as string[]);
  const all = deriveLearnings(events, profile);
  const dismissedIds = new Set(readDismissed());
  return {
    learnings: all.filter((l) => !dismissedIds.has(l.id)),
    dismissed: all.filter((l) => dismissedIds.has(l.id)),
    dismiss: dismissLearning,
    restore: restoreLearning,
  };
}

/** One object for the Honesty screen and the export button. */
export function exportPersonalData() {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    profile: readProfile(),
    labs: readLabs(),
    changelog: readChangelog(),
    dismissed: readDismissed(),
    events: readEvents(),
  };
}
