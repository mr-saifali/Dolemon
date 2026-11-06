"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { authMode } from "./auth";
import { isUnlocked } from "./app-lock";
import { listConversations } from "./db";
import { usePrefs } from "./prefs";
import { useSession } from "./session";
import { getSupabase } from "./supabase";
import { openAppPresenceChannel, type LivePresence } from "./app-presence-channel";

const PresenceContext = createContext<Record<string, LivePresence>>({});

/** Track only while an authenticated user's app is visible, independently of
 * which chat is open. Each channel is scoped to a single conversation. */
export function AppPresenceProvider({ children }: { children: ReactNode }) {
  const { account } = useSession();
  const { showPresence } = usePrefs();
  const pathname = usePathname();
  const enabled = authMode === "supabase" && !!account?.id && !!account.profileComplete && (!account.hasAppLock || isUnlocked(account.id)) && (pathname?.startsWith("/app") || pathname === "/settings");
  const [states, setStates] = useState<Record<string, LivePresence>>({});
  const shareRef = useRef(showPresence);
  shareRef.current = showPresence;
  const syncRef = useRef<() => void>(() => {});
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    const client = getSupabase();
    if (!enabled || !account?.id || !client) { setStates({}); return; }
    const me = account.id;
    let active = true;
    let generation = 0;
    const channels = new Map<string, { partner: string; bus: ReturnType<typeof openAppPresenceChannel> }>();
    const clearState = (id: string) => setStates((prev) => { if (!(id in prev)) return prev; const next = { ...prev }; delete next[id]; return next; });
    const refresh = () => {
      const seq = ++generation;
      void listConversations().then((rows) => {
        if (!active || seq !== generation) return;
        const wanted = new Map(rows.filter((row) => row.partnerId && row.partnerId !== me).map((row) => [row.id, row.partnerId]));
        channels.forEach(({ partner, bus }, id) => {
          if (wanted.get(id) !== partner) { bus.stop(); channels.delete(id); clearState(id); }
        });
        wanted.forEach((partner, id) => {
          if (channels.has(id)) return;
          const bus = openAppPresenceChannel(client, id, me, partner, () => shareRef.current, (state) => {
            if (active) setStates((prev) => prev[id] === state ? prev : { ...prev, [id]: state });
          });
          channels.set(id, { partner, bus });
        });
      }).catch(() => { /* Keep existing channels on a transient inbox failure. */ });
    };
    const update = () => channels.forEach(({ bus }) => bus.updateSharing());
    const visibility = () => { update(); if (document.visibilityState === "visible") refresh(); };
    const reconnect = () => { update(); refresh(); };
    const disconnect = () => channels.forEach(({ bus }) => bus.disconnected());
    refreshRef.current = refresh;
    syncRef.current = update;
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      active = false; generation++; clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", reconnect); window.removeEventListener("offline", disconnect);
      channels.forEach(({ bus }) => bus.stop());
      syncRef.current = () => {}; refreshRef.current = () => {};
      setStates({});
    };
  }, [enabled, account?.id]);
  useEffect(() => { syncRef.current(); }, [showPresence]);
  // Newly opened chats should join promptly rather than waiting for the poll.
  useEffect(() => { refreshRef.current(); }, [pathname]);
  return <PresenceContext.Provider value={states}>{children}</PresenceContext.Provider>;
}

export function useAppPresence() { return useContext(PresenceContext); }
