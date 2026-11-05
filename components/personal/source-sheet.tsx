"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { PresenceSession } from "@/lib/presence-log";
import { eventLabel, useEvents } from "@/lib/personal/store";
import type { PersonalEvent } from "@/lib/personal/core";

/** Tap any number → see the real events behind it. No invented statistics. */
export function SourceSheet({
  open,
  sessions,
  onClose,
}: {
  open: boolean;
  sessions: PresenceSession[];
  onClose: () => void;
}) {
  const events = useEvents();
  const presenceEvents = events.filter(
    (e) => e.kind === "presence.together" || e.kind === "presence.apart" || e.kind === "room.open"
  );

  const fmt = (ts: number) =>
    new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <motion.button type="button" aria-label="Close sources" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/70" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Where these numbers come from"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="relative max-h-[78vh] w-full max-w-md overflow-hidden rounded-t-[26px] border border-white/[0.07] bg-[#14141A] pb-6 sm:rounded-[24px]"
          >
            <div className="flex items-center gap-2 px-4 pb-2 pt-4">
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-zinc-100">Where this comes from</p>
                <p className="mt-0.5 text-[11.5px] text-zinc-500">Every minute below was logged while you were both here.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-4 pt-2">
              <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">Together sessions · {sessions.length}</p>
              {sessions.length === 0 ? (
                <p className="rounded-xl bg-white/[0.03] px-3 py-3 text-[12.5px] text-zinc-500">
                  None yet. This is zero, not a friendly guess — stay in the chat together and the first one appears here.
                </p>
              ) : (
                [...sessions].reverse().slice(0, 40).map((s) => (
                  <div key={s.id} className="mb-1.5 flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-300">{fmt(s.start)} → {fmt(s.end)}</span>
                    <span className="shrink-0 text-[11px] text-zinc-500">{Math.max(1, Math.round((s.end - s.start) / 60_000))}m</span>
                  </div>
                ))
              )}

              <p className="mb-2 mt-5 text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">Presence events · {presenceEvents.length}</p>
              {presenceEvents.length === 0 ? (
                <p className="text-[12px] text-zinc-500">No presence events recorded yet.</p>
              ) : (
                presenceEvents.slice(-12).reverse().map((e: PersonalEvent) => (
                  <p key={e.id} className="flex items-center gap-2 py-1 text-[11.5px] text-zinc-400">
                    <span className="text-zinc-600">{fmt(e.at)}</span> {eventLabel(e.kind)}
                  </p>
                ))
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
