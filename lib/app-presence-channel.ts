"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

export type LivePresence = "online" | "not-visible" | "unavailable";

/** App-wide presence in a private, conversation-member-only Realtime channel.
 * Absence is intentionally not treated as proof of being offline. */
export function openAppPresenceChannel(client: SupabaseClient, conversationId: string, me: string, partnerId: string, share: () => boolean, onChange: (state: LivePresence) => void) {
  const channel = client.channel(`app-presence:${conversationId}`, { config: { private: true, presence: { key: me } } });
  let stopped = false;
  let subscribed = false;
  let queue = Promise.resolve();
  const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
  const updateSharing = () => {
    queue = queue.catch(() => undefined).then(async () => {
      if (stopped || !subscribed) return;
      const result = share() && visible() ? await channel.track({}) : await channel.untrack();
      if (!stopped && result !== "ok") onChange("unavailable");
    }).catch(() => { if (!stopped) onChange("unavailable"); });
  };
  channel.on("presence", { event: "sync" }, () => {
    if (stopped || !subscribed || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
    const state = channel.presenceState();
    onChange(Array.isArray(state[partnerId]) && state[partnerId].length > 0 ? "online" : "not-visible");
  }).subscribe((status) => {
    if (stopped) return;
    if (status === "SUBSCRIBED") { subscribed = true; onChange("unavailable"); updateSharing(); }
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      subscribed = false;
      onChange("unavailable");
    }
  });
  return {
    updateSharing,
    disconnected() { if (!stopped) onChange("unavailable"); },
    stop() {
      if (stopped) return;
      stopped = true;
      subscribed = false;
      void client.removeChannel(channel);
    },
  };
}
