"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BrainCircuit, Clock3, Flame, Heart, Lamp, List, MapPin, Plus, Sparkles } from "lucide-react";
import { DoremonFace } from "@/components/chat/doremon";
import type { ChatRowData } from "@/components/home/chat-row";
import { climateFor, greetingForProfile, isQuietHour } from "@/lib/personal/core";
import { recordEvent, useLabs, useProfile } from "@/lib/personal/store";
import { setPref, usePrefs } from "@/lib/prefs";

type Loop = { id: string; text: string };

/**
 * Home is a room, not a list. One 1:1 app is the only messenger that can
 * afford this: no inbox, no unread badges, no queue — a place you own.
 */
export function SpatialRoom({
  rows,
  accountName,
  openLoops,
  tension = 0,
  onOpenStart,
  onToggleList,
  onOpenChat,
  onOpenDoremon,
}: {
  rows: ChatRowData[];
  accountName: string;
  openLoops: Loop[];
  tension?: number;
  onOpenStart: () => void;
  onToggleList: () => void;
  onOpenChat: (id: string) => void;
  onOpenDoremon: () => void;
}) {
  const profile = useProfile();
  const labs = useLabs();
  const prefs = usePrefs();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    recordEvent("room.open");
    return () => window.clearInterval(t);
  }, []);

  const climate = useMemo(
    () => (labs["climate.wallpaper"] ? climateFor(profile, now, tension) : null),
    [labs, profile, now, tension]
  );
  const quiet = isQuietHour(profile, now);
  const person = rows[0]?.name ?? null;
  const clock = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const date = now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#09090B]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: climate?.gradient ?? "radial-gradient(ellipse at 15% 15%,rgba(255,92,122,0.14),transparent 55%)" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-[380px] w-[380px] rounded-full"
        animate={{ opacity: prefs.lampOn ? [0.5, 0.8, 0.5] : 0.18, scale: prefs.lampOn ? [1, 1.05, 1] : 1 }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{ background: `radial-gradient(circle, ${climate?.glow ?? "rgba(255,92,122,0.14)"}, transparent 68%)` }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-10 safe-t">
        <header className="flex items-start justify-between gap-3 pb-4 pt-9">
          <div className="min-w-0">
            <p className="wordmark flex items-center gap-1.5 text-[10px] font-medium uppercase text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
              Dolemon
            </p>
            <h1 className="mt-2 text-[23px] font-light leading-tight tracking-[-0.01em] text-zinc-100">
              {greetingForProfile(profile, now)}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-[11.5px] text-zinc-500">
              <Clock3 className="h-3 w-3" /> {clock} · {date}
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-zinc-500">
              <MapPin className="h-3 w-3" /> {profile.city || "somewhere"} · {climate?.label ?? "soft glow"}
              {quiet && <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] text-violet-soft">quiet hours</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Link href="/app/brain" aria-label="Your brain" className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:text-white active:scale-95">
              <BrainCircuit className="h-[18px] w-[18px]" />
            </Link>
            <button type="button" onClick={onToggleList} aria-label="Show chat list" className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 hover:text-white active:scale-95">
              <List className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        {/* the place itself — two lights and a line between them */}
        <section className="relative mt-2 overflow-hidden rounded-[26px] border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-6 shadow-card">
          <div className="flex items-center justify-center gap-6">
            <button type="button" onClick={() => person && onOpenChat(rows[0].id)} className="flex flex-col items-center gap-2 active:scale-95">
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 text-[22px] font-light text-zinc-200"
                style={{ background: "radial-gradient(circle at 35% 30%, rgba(255,92,122,0.28), rgba(255,92,122,0.06))" }}
              >
                {person ? person.slice(0, 1).toUpperCase() : "?"}
              </span>
              <span className="max-w-[86px] truncate text-[11.5px] text-zinc-400">{person ?? "no one yet"}</span>
            </button>

            <div className="relative flex h-10 w-16 items-center justify-center">
              <motion.div
                className="h-px w-full bg-gradient-to-r from-transparent via-rose/70 to-transparent"
                animate={{ opacity: prefs.lampOn ? [0.4, 1, 0.4] : 0.16 }}
                transition={prefs.lampOn ? { duration: 3.2, repeat: Infinity } : { duration: 0.4 }}
              />
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-violet/10 text-[22px] font-light text-zinc-200">
                {accountName.slice(0, 1).toUpperCase()}
              </span>
              <span className="max-w-[86px] truncate text-[11.5px] text-zinc-400">you</span>
            </div>
          </div>

          <p className="mt-6 text-center text-[13.5px] font-medium text-zinc-200">
            {person ? `A quiet place for just you two.` : "It's a little quiet here."}
          </p>
          <p className="mt-1 text-center text-[11.5px] text-zinc-500">
            {prefs.lampOn ? "Your light is on while you're away." : "Nothing is required of you in this room."}
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setPref("lampOn", !prefs.lampOn);
                recordEvent("lab.toggle", { meta: { lamp: !prefs.lampOn } });
              }}
              className="flex items-center gap-1.5 rounded-full border border-amber/25 bg-amber/[0.08] px-3 py-1.5 text-[11.5px] text-amber-200 active:scale-95"
            >
              <Lamp className="h-3.5 w-3.5" /> {prefs.lampOn ? "Light is on" : "Leave a light on"}
            </button>
            <button type="button" onClick={onOpenDoremon} className="flex items-center gap-1.5 rounded-full border border-sky/25 bg-sky/[0.08] px-3 py-1.5 text-[11.5px] text-sky-200 active:scale-95">
              <DoremonFace size={14} /> Doremon&apos;s pocket
            </button>
            <Link href="/app/brain#loops" className="flex items-center gap-1.5 rounded-full border border-rose/25 bg-rose/[0.08] px-3 py-1.5 text-[11.5px] text-rose/90 active:scale-95">
              <Sparkles className="h-3.5 w-3.5" /> {openLoops.length} open {openLoops.length === 1 ? "loop" : "loops"}
            </Link>
          </div>
        </section>

        {/* a shelf of artifacts, not a queue of conversations */}
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10.5px] uppercase tracking-[0.16em] text-zinc-500">On the shelf</p>
            <button type="button" onClick={onOpenStart} aria-label="Start a conversation" className="flex items-center gap-1 text-[11.5px] text-zinc-400 hover:text-white">
              <Plus className="h-3.5 w-3.5" /> add
            </button>
          </div>
          {rows.length === 0 ? (
            <button type="button" onClick={onOpenStart} className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-6 text-center text-[13px] text-zinc-400 hover:bg-white/[0.05]">
              Nothing here yet. Invite your person and the room wakes up.
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {rows.slice(0, 4).map((row, i) => (
                <motion.button
                  key={row.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => onOpenChat(row.id)}
                  className="flex h-28 flex-col justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 text-left hover:bg-white/[0.06] active:scale-[0.98]"
                >
                  <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-200">
                    <Heart className="h-3 w-3 text-rose/70" /> {row.name}
                  </span>
                  <span className="line-clamp-3 text-[11.5px] leading-snug text-zinc-500">{row.preview}</span>
                </motion.button>
              ))}
            </div>
          )}
        </section>

        {openLoops.length > 0 && (
          <Link href="/app/brain#loops" className="mt-4 flex items-center gap-2 rounded-2xl border border-violet/20 bg-violet/[0.06] px-3 py-2.5 text-[12px] text-zinc-300">
            <Flame className="h-3.5 w-3.5 shrink-0 text-violet-soft" />
            <span className="line-clamp-1 flex-1">{openLoops[0].text}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">+{Math.max(0, openLoops.length - 1)}</span>
          </Link>
        )}

        <p className="mt-auto pt-8 text-center text-[10.5px] text-zinc-600">
          No unread badges. No streak pressure. Just a room that is yours.
        </p>
      </div>
    </main>
  );
}
