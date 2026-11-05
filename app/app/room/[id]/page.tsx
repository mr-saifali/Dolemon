"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Flame, Heart, Info, Lock, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { Avatar } from "@/components/avatar";
import { PulseOverlay } from "@/components/chat/pulse-overlay";
import { Switch } from "@/components/ui/switch";
import { authMode } from "@/lib/auth";
import { demoConversations } from "@/lib/chat";
import { formatAgo, formatDuration, usePresence } from "@/lib/presence";
import {
  lastSevenDays,
  lastSession,
  loadSessions,
  minutesTogetherToday,
  streakDays,
  totalMinutes,
  type PresenceSession,
} from "@/lib/presence-log";
import { usePulses } from "@/lib/pulses";
import { setPref, usePrefs } from "@/lib/prefs";
import { listConversations } from "@/lib/db";
import { SourceSheet } from "@/components/personal/source-sheet";

function RoomScreen() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const [conversation] = useState(
    () => demoConversations().find((c) => c.id === conversationId) ?? null
  );
  const [partnerName, setPartnerName] = useState(conversation?.name ?? "Them");
  const [sourcesOpen, setSourcesOpen] = useState(false);

  // Honesty: in live mode the room must name the real person, never "Them".
  useEffect(() => {
    if (authMode !== "supabase") return;
    void listConversations()
      .then((rows) => {
        const found = rows.find((r) => r.id === conversationId);
        if (found) setPartnerName(found.partnerUsername);
      })
      .catch(() => undefined);
  }, [conversationId]);

  const prefs = usePrefs();
  const { together, partner, togetherSince, lastSeenAt } = usePresence({ demo: authMode === "local" });
  const pulses = usePulses({ demo: authMode === "local" });
  const [sessions, setSessions] = useState<PresenceSession[]>([]);

  useEffect(() => {
    const refresh = () => setSessions(loadSessions(conversationId));
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [conversationId]);

  const today = minutesTogetherToday(sessions);
  const week = useMemo(() => lastSevenDays(sessions), [sessions]);
  const maxWeek = Math.max(1, ...week.map((d) => d.minutes));
  const streak = streakDays(sessions);
  const last = lastSession(sessions);
  const recent = useMemo(
    () => [...sessions].sort((a, b) => b.start - a.start).slice(0, 5),
    [sessions]
  );

  const statusText = together
    ? `Both here${togetherSince ? ` · ${formatDuration(Date.now() - togetherSince)}` : ""}`
    : lastSeenAt
      ? `Away · last here ${formatAgo(lastSeenAt)}`
      : "Away";

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-ink">
      <PulseOverlay
        burst={pulses.burst}
        incoming={Boolean(pulses.incoming)}
        incomingText={pulses.incoming ? `${partnerName} is thinking of you` : null}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        animate={{ opacity: together ? 1 : 0.25 }}
        transition={{ duration: 0.9 }}
      >
        <div className="absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.28),transparent_66%)]" />
      </motion.div>

      <div className="relative z-10 mx-auto w-full max-w-md px-6 pb-16 safe-t">
        <header className="flex items-center gap-2 pb-2 pt-5">
          <Link
            href={`/app/chat/${conversationId}`}
            aria-label="Back to chat"
            className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.05] hover:text-text"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-[17px] font-semibold tracking-[-0.01em]">Your room</h1>
          <Link
            href="/settings"
            aria-label="Presence settings"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.05] hover:text-text"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </Link>
        </header>

        {/* the two of you */}
        <section className="relative mt-4 overflow-hidden rounded-[24px] border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-6 shadow-card">
          <div className="flex items-center justify-center gap-5">
            <Avatar avatarId={conversation?.avatarId ?? null} name={partnerName} size="lg" online={together} />
            <div className="relative flex h-8 w-16 items-center justify-center">
              <motion.div
                className="h-px w-full bg-gradient-to-r from-transparent via-rose/70 to-transparent"
                animate={{ opacity: together ? [0.35, 1, 0.35] : 0.12 }}
                transition={together ? { duration: 2.4, repeat: Infinity } : { duration: 0.4 }}
              />
              {together && (
                <motion.span
                  className="absolute h-1.5 w-1.5 rounded-full bg-rose"
                  animate={{ x: [-24, 24, -24] }}
                  transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
            <Avatar avatarId={null} name="You" size="lg" online={prefs.showPresence} />
          </div>

          <p className="mt-5 text-center text-[15px] font-medium">{statusText}</p>
          <p className="mt-1 text-center text-[12px] text-text-muted">
            {together
              ? "The room is warm while you're both in it."
              : prefs.lampOn
                ? "Your light is still on in here."
                : "It waits for you. Nothing is lost."}
          </p>

          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => {
                const result = pulses.send();
                if (result === "disabled") toast.error("Pulses are off in settings");
                else if (result === "sent") toast.success("Pulse sent");
              }}
              disabled={!prefs.allowPulses}
              className="flex items-center gap-2 rounded-full border border-rose/30 bg-rose/10 px-4 py-2 text-[12.5px] font-medium text-rose transition-colors hover:bg-rose/15 disabled:opacity-40"
            >
              <Heart className="h-3.5 w-3.5" />
              Send a pulse
            </button>
          </div>
        </section>

        {/* lamp */}
        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">🕯️</span>
            <p className="text-[13.5px] font-medium">Leave a light on</p>
          </div>
          <Switch
            label="Keep the room lit when I leave"
            description="A warm glow stays here so they know you're still close — even when you're not looking at your phone."
            checked={prefs.lampOn}
            onChange={(next) => {
              setPref("lampOn", next);
              toast.success(next ? "Your light is on" : "Light turned off");
            }}
          />
        </section>

        {/* together today */}
        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11.5px] uppercase tracking-[0.14em] text-text-muted/70">
                Together today
              </p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="text-[30px] font-semibold leading-none tracking-[-0.02em]">
                  {today}
                </span>
                <span className="text-[13px] text-text-muted">min</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSourcesOpen(true)}
                aria-label="Where these numbers come from"
                className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10.5px] text-zinc-400 active:scale-95"
              >
                <Info className="h-3 w-3" /> sources
              </button>
              <div className="flex items-center gap-1 rounded-full border border-rose/20 bg-rose/10 px-2.5 py-1 text-[11.5px] text-rose">
                <Flame className="h-3 w-3" />
                {streak}-day streak
              </div>
            </div>
          </div>

          <div className="mt-5 flex h-24 items-end justify-between gap-2">
            {week.map((day) => {
              const h = day.minutes === 0 ? 4 : Math.max(6, Math.round((day.minutes / maxWeek) * 88));
              return (
                <div key={day.dayStart} className="flex flex-1 flex-col items-center gap-1.5">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: h }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className={
                      day.isToday
                        ? "w-full max-w-[18px] rounded-full bg-gradient-to-t from-rose/50 to-rose"
                        : "w-full max-w-[18px] rounded-full bg-white/[0.10]"
                    }
                    title={`${day.minutes} min`}
                  />
                  <span
                    className={
                      day.isToday
                        ? "text-[10px] font-medium text-rose"
                        : "text-[10px] text-text-muted/60"
                    }
                  >
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-text-muted/60">
            {totalMinutes(sessions).toLocaleString("en-IN")} minutes together in total
            {last ? ` · last time ${formatAgo(last.end)}` : ""}
          </p>
        </section>

        {/* presence moments */}
        <section className="mt-4 rounded-xl2 border border-ink-line bg-ink-surface/70 p-4">
          <p className="mb-3 text-[11.5px] uppercase tracking-[0.14em] text-text-muted/70">
            Presence moments
          </p>
          <ul className="space-y-3">
            {recent.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose/10 text-rose">
                  <Heart className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-text/90">{momentLabel(s)}</p>
                  <p className="text-[11px] text-text-muted/70">{momentRange(s)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-text-muted">
                  {Math.max(1, Math.round((s.end - s.start) / 60_000))}m
                </span>
              </li>
            ))}
            {recent.length === 0 && (
              <li className="text-[12.5px] text-text-muted">
                No moments yet. Open the chat and stay a while.
              </li>
            )}
          </ul>
        </section>

        <SourceSheet open={sourcesOpen} sessions={sessions} onClose={() => setSourcesOpen(false)} />

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11px] text-text-muted/50">
          <Lock className="h-3 w-3" />
          This room and its history are only ever yours.
        </p>
      </div>
    </main>
  );
}

function momentLabel(s: PresenceSession) {
  const d = new Date(s.start);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const label = sameDay
    ? "Together today"
    : isYesterday
      ? "Together yesterday"
      : `Together ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  return label;
}

function momentRange(s: PresenceSession) {
  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${fmt(s.start)} – ${fmt(s.end)}`;
}

export default function RoomPage() {
  return (
    <AppGuard>
      <RoomScreen />
    </AppGuard>
  );
}
