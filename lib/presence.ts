"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PartnerPresence = "here" | "away" | "typing";

/**
 * Room presence.
 *
 * The product idea: Dolemon isn't an inbox you check, it's a room you're both in.
 * So presence is the primary state of the thread, not a subtitle.
 *
 * - `together` is true only when both people are actually in the room.
 * - `togetherSince` drives the shared clock shown in the header.
 * - `lastSeenAt` powers "left 2m ago" once one of you goes.
 *
 * In demo mode a partner's presence can be simulated with setPartner(); with
 * Supabase this maps onto a Realtime presence channel (see docs/supabase.md).
 */
export function usePresence({ demo = false }: { demo?: boolean } = {}) {
  const [partner, setPartner] = useState<PartnerPresence>("here");
  const [iAmHere, setIAmHere] = useState(true);
  const [togetherSince, setTogetherSince] = useState<number | null>(() => Date.now());
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const wasTogether = useRef(true);

  const together = iAmHere && partner !== "away";

  useEffect(() => {
    const onVisibility = () => setIAmHere(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (together && !wasTogether.current) {
      setTogetherSince(Date.now());
      setLastSeenAt(null);
    }
    if (!together && wasTogether.current) {
      setTogetherSince(null);
      setLastSeenAt(Date.now());
    }
    wasTogether.current = together;
  }, [together]);

  // Demo only: drift in and out of the room so the presence layer is visible.
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
