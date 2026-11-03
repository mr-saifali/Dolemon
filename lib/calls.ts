"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CallInfo } from "./thread";

export type CallDirection = "incoming" | "outgoing";
export type CallPhase = "incoming" | "dialing" | "ringing" | "connected" | "ended";

/**
 * Call session state machine.
 *
 * The UI is complete and the phases match what a real WebRTC session needs, so wiring a
 * provider means replacing `dial()` with an offer/answer exchange and `end()` with a
 * teardown — see docs/supabase.md §6.
 *
 * In demo mode the other side answers after a short ring and media stays simulated.
 * The voice ↔ video switch works the same way it will once the live provider is wired.
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
  const [callType, setCallType] = useState<CallInfo["type"]>(type);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(callType === "video");
  const [cameraOn, setCameraOn] = useState(callType === "video");
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

  /** Flip between a voice-only call and a video call, mid-call. */
  const toggleType = useCallback(() => {
    setCallType((t) => {
      const next: CallInfo["type"] = t === "video" ? "voice" : "video";
      if (next === "video") setCameraOn(true);
      return next;
    });
  }, []);

  const end = useCallback((): CallInfo => {
    const durationMs = connectedAt ? Date.now() - connectedAt : 0;
    setPhase("ended");
    return { type: callType, durationMs, missed: durationMs === 0 && direction === "incoming" };
  }, [callType, connectedAt, direction]);

  const decline = useCallback((): CallInfo => {
    setPhase("ended");
    return { type: callType, durationMs: 0, missed: true };
  }, [callType]);

  return {
    phase,
    type: callType,
    elapsed,
    muted,
    speaker,
    cameraOn,
    frontCamera,
    setMuted,
    setSpeaker,
    setCameraOn,
    setFrontCamera,
    toggleType,
    accept,
    decline,
    end,
  };
}
