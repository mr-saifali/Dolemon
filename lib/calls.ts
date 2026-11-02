"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallInfo } from "./thread";

export type CallDirection = "outgoing" | "incoming";
export type CallPhase = "incoming" | "dialing" | "ringing" | "connected" | "ended";

/**
 * Call session state machine.
 *
 * The UI is complete and the phases match what a real WebRTC session needs, so wiring a
 * provider means replacing `dial()` with an offer/answer exchange and `end()` with a
 * teardown — see docs/supabase.md §6.
 *
 * In demo mode the other side answers after a short ring and media stays simulated.
 */
export function useCallSession({
  direction,
  type,
  demo = true,
}: {
  direction: CallDirection;
  type: CallInfo["type"];
  demo?: boolean;
}) {
  const [phase, setPhase] = useState<CallPhase>(direction === "incoming" ? "incoming" : "dialing");
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(type === "video");
  const [cameraOn, setCameraOn] = useState(type === "video");
  const [frontCamera, setFrontCamera] = useState(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const connect = useCallback(() => {
    setPhase("connected");
    setConnectedAt(Date.now());
  }, []);

  // Outgoing: dial → ring → connected (the demo partner always picks up).
  useEffect(() => {
    if (direction !== "outgoing" || !demo) return;
    timers.current.push(setTimeout(() => setPhase("ringing"), 1600));
    timers.current.push(setTimeout(connect, 4200));
  }, [direction, demo, connect]);

  useEffect(() => {
    if (!connectedAt) return;
    const t = setInterval(() => setElapsed(Date.now() - connectedAt), 500);
    return () => clearInterval(t);
  }, [connectedAt]);

  const accept = useCallback(() => {
    if (phase === "incoming") connect();
  }, [phase, connect]);

  const end = useCallback((): CallInfo => {
    const durationMs = connectedAt ? Date.now() - connectedAt : 0;
    setPhase("ended");
    return { type, durationMs, missed: durationMs === 0 && direction === "incoming" };
  }, [connectedAt, direction, type]);

  const decline = useCallback((): CallInfo => {
    setPhase("ended");
    return { type, durationMs: 0, missed: true };
  }, [type]);

  return {
    phase,
    elapsed,
    muted,
    speaker,
    cameraOn,
    frontCamera,
    setMuted,
    setSpeaker,
    setCameraOn,
    setFrontCamera,
    accept,
    decline,
    end,
  };
}
