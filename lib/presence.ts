"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { appendSession } from "./presence-log";
import { usePrefs } from "./prefs";

export type PartnerPresence = "here" | "away" | "typing";

/**
 * Room presence.
 *
 * Dolemon isn't an inbox you check, it's a room you're both in. Presence is therefore the
 * primary state of the product:
 * - `together` — both people are in the room right now
 * - `togetherSince` — drives the shared clock in the header
 * - `lastSeenAt` — powers "left 2m ago"
 *
 * With Supabase this maps onto a Realtime presence channel; see docs/supabase.md §4.
 */
export function usePresence({
  demo = false,
  logKey,
  liveOnline = null,
}: {
  demo?: boolean;
  /** conversation id — enables presence-memory logging for the session */
  logKey?: string;
  /** live mode: the real `presence:` channel, instead of an optimistic "here" */
  liveOnline?: boolean | null;
} = {}) {
  const prefs = usePrefs();
  // In live mode we must NOT assume the other person is here. An invented
  // "you're both here" is exactly the kind of fake number Dolemon refuses to show.
  const [partner, setPartner] = useState<PartnerPresence>(demo ? "here" : "away");
  const [pageVisible, setPageVisible] = useState(true);
  const [togetherSince, setTogetherSince] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);

  // You're "in the room" only if the page is visible and you allow presence.
  const iAmHere = pageVisible && prefs.showPresence;
  const together = iAmHere && partner !== "away";
  const wasTogether = useRef(false);
  const sessionStart = useRef<number | null>(null);

  // Live mode: the real Realtime presence channel drives this room.
  useEffect(() => {
    if (demo || liveOnline == null) return;
    setPartner(liveOnline ? "here" : "away");
  }, [demo, liveOnline]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (together && !wasTogether.current) {
      setTogetherSince(Date.now());
      setLastSeenAt(null);
      sessionStart.current = Date.now();
    }
    if (!together && wasTogether.current) {
      setTogetherSince(null);
      setLastSeenAt(Date.now());
      if (logKey && sessionStart.current) {
        appendSession(logKey, { start: sessionStart.current, end: Date.now() });
      }
      sessionStart.current = null;
    }
    wasTogether.current = together;
  }, [together, logKey]);

  // Log the tail of a session if the screen unmounts while you're still together.
  useEffect(() => {
    return () => {
      if (logKey && sessionStart.current && wasTogether.current) {
        appendSession(logKey, { start: sessionStart.current, end: Date.now() });
      }
    };
  }, [logKey]);

  // Demo only: drift in and out so the presence layer is visible without a backend.
  useEffect(() => {
    if (!demo) return;
    const t = setInterval(() => {
      setPartner((p) => (p === "away" ? "here" : "away"));
    }, 18_000);
    return () => clearInterval(t);
  }, [demo]);

  const setPresence = useCallback((next: PartnerPresence) => setPartner(next), []);

  return { partner, together, togetherSince, lastSeenAt, iAmHere, setPresence };
}

/** "38s" · "4m" · "1h 06m" */
export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function formatAgo(at: number, now = Date.now()) {
  const diff = Math.max(0, now - at);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
