"use client";

import { getSupabase } from "@/lib/supabase";

/**
 * Real pulses in live mode. A pulse is a broadcast event on the conversation
 * channel — no row in the database, nothing in the thread, nothing to leak.
 * In the local demo `usePulses` still simulates the reply; here it travels.
 */
export type PulseBus = { send: () => void; stop: () => void };

export function openPulseBus(
  conversationId: string,
  me: string,
  onIncoming: (at: number) => void
): PulseBus | null {
  const sb = getSupabase();
  if (!sb) return null;
  const channel = sb.channel(`pulse:${conversationId}`, {
    config: { broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: "pulse" }, ({ payload }) => {
      const p = payload as { from?: string; at?: number } | undefined;
      if (!p || p.from === me) return;
      onIncoming(typeof p.at === "number" ? p.at : Date.now());
    })
    .subscribe();
  return {
    send: () => {
      try {
        void channel.send({ type: "broadcast", event: "pulse", payload: { from: me, at: Date.now() } });
      } catch {
        /* channel not ready yet — the pulse is a gesture, never a queue */
      }
    },
    stop: () => {
      void sb.removeChannel(channel);
    },
  };
}
