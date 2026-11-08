"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Browser connectivity is a hint, not a guarantee the backend is reachable. */
export function NetworkStatus() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex justify-center px-3 pt-[max(env(safe-area-inset-top),8px)]">
      {!online && (
        <p className="rounded-full border border-white/15 bg-zinc-900 px-4 py-2 text-center text-xs text-white shadow-lg">
          You&apos;re offline — showing saved chats. Sending and calls need a connection.
        </p>
      )}
    </div>
  );
}
