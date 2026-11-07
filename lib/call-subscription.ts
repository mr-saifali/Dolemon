import type { RealtimeChannel } from "@supabase/supabase-js";

/** Do not mistake a Realtime error or a stalled subscription for a connected call. */
export function waitForCallSubscription(channel: RealtimeChannel, timeoutMs = 12_000): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timeout);
        resolve(status === "SUBSCRIBED");
      }
    });
  });
}
