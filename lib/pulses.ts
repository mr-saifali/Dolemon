"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefs } from "./prefs";

export type PulseResult = "sent" | "cooldown" | "disabled";
export type IncomingPulse = { at: number; mutual: boolean };

const COOLDOWN_MS = 15_000;
const MUTUAL_WINDOW_MS = 60_000;

/**
 * Pulses — the smallest possible "I'm thinking about you" that isn't a message.
 *
 * A pulse leaves no message in the thread. It lands in the room as light: hearts drift up,
 * the screen warms for a second, and then it's gone. Two pulses crossing within a minute
 * become a shared presence moment, which is the only trace left behind.
 */
export function usePulses({
  demo = false,
  onMutual,
  onIncoming,
}: {
  demo?: boolean;
  onMutual?: () => void;
  onIncoming?: (incoming: IncomingPulse) => void;
}) {
  const prefs = usePrefs();
  const [coolingUntil, setCoolingUntil] = useState(0);
  const [burst, setBurst] = useState(0);
  const [incoming, setIncoming] = useState<IncomingPulse | null>(null);
  const lastSent = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const callbacks = useRef({ onMutual, onIncoming });
  callbacks.current = { onMutual, onIncoming };

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const receive = useCallback(() => {
    const at = Date.now();
    const mutual = at - lastSent.current < MUTUAL_WINDOW_MS;
    const payload = { at, mutual };
    setIncoming(payload);
    setBurst((b) => b + 1);
    callbacks.current.onIncoming?.(payload);
    if (mutual) callbacks.current.onMutual?.();
    timers.current.push(setTimeout(() => setIncoming(null), 4200));
  }, []);

  const send = useCallback((): PulseResult => {
    if (!prefs.allowPulses) return "disabled";
    if (Date.now() < coolingUntil) return "cooldown";
    lastSent.current = Date.now();
    setCoolingUntil(Date.now() + COOLDOWN_MS);
    setBurst((b) => b + 1);

    // Demo: they sometimes reach back.
    if (demo && Math.random() > 0.35) {
      timers.current.push(setTimeout(receive, 3500 + Math.random() * 3500));
    }
    return "sent";
  }, [coolingUntil, demo, prefs.allowPulses, receive]);

  // Demo: an unprompted pulse now and then, so the feature is discoverable.
  useEffect(() => {
    if (!demo || !prefs.allowPulses) return;
    const t = setInterval(() => {
      if (Math.random() > 0.45) receive();
    }, 55_000);
    return () => clearInterval(t);
  }, [demo, prefs.allowPulses, receive]);

  const cooling = Date.now() < coolingUntil;

  return { send, receive, coolingUntil, cooling, burst, incoming };
}
