"use client";

import { authMode } from "./auth";

/**
 * Presence memory.
 *
 * Every time you two are in the room at the same time, the session is logged. This is what
 * lets Dolemon show "you were both here for 22 minutes last night" — a shared history that
 * a normal message log has no way to represent.
 */

export type PresenceSession = { id: string; start: number; end: number };

const key = (conversationId: string) => `dolemon:presence:${conversationId}`;
const DAY = 86_400_000;
const uid = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Plausible-looking history so the room isn't empty on first open (demo only). */
function seed(now = Date.now()): PresenceSession[] {
  const out: PresenceSession[] = [];
  const pattern: [number, number, number][] = [
    // [daysAgo, startHour, minutes]
    [1, 22, 24],
    [2, 21, 41],
    [3, 20, 12],
    [3, 23, 9],
    [4, 21, 33],
    [6, 22, 18],
    [7, 20, 27],
  ];
  for (const [daysAgo, hour, minutes] of pattern) {
    const start = new Date(now - daysAgo * DAY);
    start.setHours(hour, 12, 0, 0);
    out.push({ id: uid() + daysAgo, start: start.getTime(), end: start.getTime() + minutes * 60_000 });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function loadSessions(conversationId: string): PresenceSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(conversationId));
    if (raw) return JSON.parse(raw) as PresenceSession[];
  } catch {
    /* fall through */
  }
  // Honesty: invented history is only ever allowed in the local demo. A live
  // account starts at zero and every minute shown is a real together-session.
  if (authMode !== "local") return [];
  const seeded = seed();
  saveSessions(conversationId, seeded);
  return seeded;
}

export function saveSessions(conversationId: string, sessions: PresenceSession[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(conversationId), JSON.stringify(sessions.slice(-400)));
  } catch {
    /* ignore */
  }
}

export function appendSession(conversationId: string, session: Omit<PresenceSession, "id">) {
  if (session.end - session.start < 3_000) return;
  const sessions = loadSessions(conversationId);
  saveSessions(conversationId, [...sessions, { ...session, id: uid() }]);
}

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function minutesTogetherToday(sessions: PresenceSession[], now = Date.now()) {
  const from = startOfDay(now);
  const ms = sessions.reduce((sum, s) => {
    const start = Math.max(s.start, from);
    const end = Math.min(s.end, now);
    return end > start ? sum + (end - start) : sum;
  }, 0);
  return Math.round(ms / 60_000);
}

export function lastSevenDays(sessions: PresenceSession[], now = Date.now()) {
  const today = startOfDay(now);
  return Array.from({ length: 7 }).map((_, i) => {
    const dayStart = today - (6 - i) * DAY;
    const dayEnd = dayStart + DAY;
    const ms = sessions.reduce((sum, s) => {
      const start = Math.max(s.start, dayStart);
      const end = Math.min(s.end, dayEnd);
      return end > start ? sum + (end - start) : sum;
    }, 0);
    return {
      dayStart,
      minutes: Math.round(ms / 60_000),
      label: new Date(dayStart).toLocaleDateString("en-IN", { weekday: "narrow" }),
      isToday: i === 6,
    };
  });
}

export function streakDays(sessions: PresenceSession[], now = Date.now()) {
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const dayStart = startOfDay(now) - i * DAY;
    const dayEnd = dayStart + DAY;
    const has = sessions.some((s) => s.start < dayEnd && s.end > dayStart);
    if (has) streak += 1;
    else if (i > 0) break;
    else if (!has) {
      // today can still be empty without breaking yesterday's streak
      continue;
    }
  }
  return streak;
}

export function lastSession(sessions: PresenceSession[], now = Date.now()) {
  const past = sessions.filter((s) => s.end <= now).sort((a, b) => b.end - a.end);
  return past[0] ?? null;
}

export function totalMinutes(sessions: PresenceSession[]) {
  return Math.round(sessions.reduce((sum, s) => sum + (s.end - s.start), 0) / 60_000);
}
