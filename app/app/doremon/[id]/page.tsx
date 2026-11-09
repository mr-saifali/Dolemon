"use client";

import { useRoomMusic } from "@/lib/use-room-music";
import { doremonFetch } from "@/lib/doremon/api";
import { displayDoremonText } from "@/lib/doremon/display";
import { deleteRoomHistory, loadRoomHistory, saveRoomHistory } from "@/lib/doremon/room-history";
import { localLookup } from "@/lib/doremon/local-search";
import { confirmDoremonSharing } from "@/lib/doremon/consent";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Download, Pencil, Send, Sunrise, Trash2, Volume2, VolumeX, MoreHorizontal, X } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { DoremonFace } from "@/components/chat/doremon";
import { ChatWallpaper, chatThemeStyle } from "@/components/chat/ChatWallpaper";
import { isVividChatTheme, resolveChatTheme } from "@/lib/chat-themes";
import { useChatMetaFor } from "@/lib/conversation-meta";
import { usePrefs } from "@/lib/prefs";
import { authMode } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { loadThread, listConversations, type DbMessage } from "@/lib/db";
import { clockTime } from "@/lib/thread";
import {
  loadDoremonMemory,
  loadDoremonStats,
  deleteDoremonMemory,
  replaceDoremonMemory,
  saveDoremonMemory,
} from "@/lib/doremon/memory";
import {
  viewStats,
  type StatsView,
} from "@/lib/doremon/insights";
import { emptyMemory, type DoremonMemory, type DoremonStats, type RoomTurn } from "@/lib/doremon/types";
import { OFFLINE_NOTICE, isOfflineNotice, offlineReason } from "@/lib/doremon/offline";

const REMOTE = authMode === "supabase";

const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;

/** A short human label for a media row when it has no body text. */
function mediaLabel(m: DbMessage): string {
  switch (m.kind) {
    case "image":
      return "📷 Photo";
    case "audio":
      return "🎙️ Voice note";
    case "file":
      return m.mediaName ? `📎 ${m.mediaName}` : "📎 File";
    case "sticker":
      return "Reaction";
    default:
      return "…";
  }
}

/** Refresh the loaded window on deliberate AI requests, with a bounded wait. */
async function latestForAi(conversationId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      loadThread(conversationId).catch(() => null),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 4000); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Local date as "YYYY-MM-DD" — the day-stamp of Doremon's daily brief. */
function localDay(now = new Date()): string {
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "2026-11-04" → "4 Nov" */
function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

type Loaded = {
  memory: DoremonMemory;
  stats: DoremonStats | null;
  recent: DbMessage[];
  meId: string | null;
  partnerId: string | null;
  partnerName: string;
  alive: boolean;
};

export default function DoremonRoomPage({ params }: { params: { id: string } }) {
  return (
    <AppGuard>
      <Room conversationId={params.id} />
    </AppGuard>
  );
}

type BrainState = "unknown" | "ready" | "online" | "no-key" | "bad-key" | "offline" | "demo";

function Room({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { account } = useSession();
  const prefs = usePrefs();
  const meta = useChatMetaFor(conversationId);
  const theme = resolveChatTheme(meta.chatTheme, prefs.chatTheme);
  const myHandle = account?.username ?? "you";

  const [data, setData] = useState<Loaded | null>(null);
  const [turns, setTurns] = useState<RoomTurn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{ text: string; at: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [brainState, setBrainState] = useState<BrainState>("unknown");
  /** Google's own words when the brain is down — shown in the chip tooltip */
  const [brainDetail, setBrainDetail] = useState("");
  const brainAsked = useRef(false);
  const requestBusy = useRef(false);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const generation = ++requestGeneration.current;
    requestBusy.current = false;
    setThinking(false); setDailyBusy(false); setPendingQuestion(null);
    return () => { requestGeneration.current = generation + 1; activeRequest.current?.abort(); };
  }, [conversationId, account?.id]);
  const [dailyBusy, setDailyBusy] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const music = useRoomMusic(Boolean(data));
  const dataRef = useRef<Loaded | null>(null);
  dataRef.current = data;

  useEffect(() => {
    if (!menuOpen) return;
    const panel = menuRef.current;
    const trigger = menuTrigger.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenuOpen(false); }
      if (event.key !== "Tab") return;
      const buttons = focusable(); if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (trigger?.isConnected && (document.activeElement === document.body || panel?.contains(document.activeElement))) trigger.focus(); };
  }, [menuOpen]);

  // Demo mode never calls the API — his brain is the local one, by design.
  useEffect(() => {
    if (!REMOTE) setBrainState("demo");
  }, []);

  /* ------------------------------------------------------------ load room */
  useEffect(() => {
    let alive = true;
    setData(null); setTurns([]); setDraft("");
    (async () => {
      try {
      const [memory, stats, thread, convoResult] = await Promise.all([
        loadDoremonMemory(conversationId, REMOTE).catch(() => null),
        REMOTE ? loadDoremonStats(conversationId, REMOTE) : Promise.resolve(null),
        REMOTE
          ? loadThread(conversationId).catch(() => ({ messages: [] as DbMessage[], me: null as string | null }))
          : Promise.resolve({ messages: [] as DbMessage[], me: null }),
        REMOTE
          ? listConversations().then(
              (convos) => ({ ok: true, convos }),
              () => ({ ok: false, convos: [] as Awaited<ReturnType<typeof listConversations>> })
            )
          : Promise.resolve({ ok: true, convos: [] as Awaited<ReturnType<typeof listConversations>> }),
      ]);
      if (!alive) return;
      const convo = convoResult.convos.find((c) => c.id === conversationId) ?? null;
      const partnerName =
        convo?.partnerUsername ||
        memory?.partnerUsername ||
        "your person";
      // Only call it "deleted" when the list actually loaded and the chat is
      // genuinely absent — a failed list fetch must not lie about deletion.
      const deleted = REMOTE && convoResult.ok && !convo;
      const next: Loaded = {
        memory: memory ?? emptyMemory(),
        stats,
        recent: thread.messages,
        meId: thread.me,
        partnerId: convo?.partnerId ?? null,
        partnerName,
        alive: !deleted,
      };
      setData(next);
      // offline notices were saved before they became history-free —
      // drop them so the room doesn't replay a wall of "offline" lines
      // Existing server-saved history is imported once; no new Q&A is uploaded.
      const local = loadRoomHistory(account?.id ?? null, conversationId);
      const previous = local ?? (next.memory.chat ?? []).filter((t) => !isOfflineNotice(t.a)).slice(-5);
      if (local === null && previous.length) saveRoomHistory(account?.id ?? null, conversationId, previous);
      setTurns(previous);
      } catch {
        // Opening the room must never leave the screen spinning: a failed or
        // offline load still renders with whatever is on this device.
        if (!alive) return;
        setData((prev) => prev ?? {
          memory: emptyMemory(),
          stats: null,
          recent: [],
          meId: null,
          partnerId: null,
          partnerName: "your person",
          alive: true,
        });
        setTurns(loadRoomHistory(account?.id ?? null, conversationId) ?? []);
      }
    })();
    return () => {
      alive = false;
    };
  }, [conversationId, account?.id]);

  const view: StatsView = useMemo(
    () => viewStats(data?.stats ?? null, data?.meId ?? null, data?.partnerId ?? null),
    [data?.stats, data?.meId, data?.partnerId]
  );

  const dossier = useMemo(() => {
    if (!data) return [];
    const lines: string[] = [];
    if (view.me && view.them) lines.push(`Saved message counts: you ${view.me.total}, other person ${view.them.total}.`);
    if (data.memory.summary) lines.push(`Saved note (may be inaccurate): ${data.memory.summary}`);
    lines.push("The available messages and saved notes may be incomplete. Feelings and future events cannot be determined from counts.");
    return lines;
  }, [data, view]);

  // Doremon's daily briefing — what happened, what's happening, what's coming.
  // WRITTEN ONLY ON TAP (the Sunrise button): one deliberate call per day,
  // never automatic. Opening the room no longer triggers any AI call.
  const runDaily = useCallback(async () => {
    if (!data || dailyBusy || requestBusy.current) return;
    const generation = requestGeneration.current;
    const today = localDay();
    if (data.memory.dailyDay === today) return;
    requestBusy.current = true;
    const allowed = await confirmDoremonSharing(REMOTE);
    if (generation !== requestGeneration.current) return;
    if (!allowed) { requestBusy.current = false; return; }
    setDailyBusy(true);
    const fresh = REMOTE ? await latestForAi(conversationId) : null;
    if (generation !== requestGeneration.current) return;
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const yesterday = (fresh?.messages ?? data.recent)
      .filter((m) => m.kind !== "presence" && m.at > dayAgo)
      .slice(-12)
      .map((m) => ({
        who: (m.senderId === data.meId ? "me" : "them") as "me" | "them",
        text: m.body || mediaLabel(m),
        at: m.at,
      }));
    let text: string | null = null;
    if (REMOTE) {
      const controller = new AbortController();
      activeRequest.current = controller;
      const timeout = setTimeout(() => controller.abort(), 50_000);
      try {
        const res = await doremonFetch({
          action: "daily", sharing: "conversation-v1",
          me: myHandle,
          partner: data.partnerName,
          meId: data.meId,
          partnerId: data.partnerId,
          yesterday,
          day: today,
          memory: data.memory,
          stats: data.stats,
        }, controller.signal);
        const out = (await res.json()) as { ok?: boolean; answer?: string };
        if (res.ok && out.ok && out.answer) text = out.answer;
      } catch {
        // No invented fallback brief when the provider is unavailable.
      } finally {
        clearTimeout(timeout);
      }
    }
    if (generation !== requestGeneration.current) return;
    if (!text) {
      requestBusy.current = false;
      setDailyBusy(false);
      toast("Briefing unavailable. The loaded message window may be incomplete; please try again later.");
      return;
    }
    requestBusy.current = false;
    setDailyBusy(false);
    // land the two daily fields on whatever the FRESHEST memory is
    setData((prev) => (prev ? { ...prev, memory: { ...prev.memory, dailyDay: today, dailyBriefing: text } } : prev));
    void saveDoremonMemory(
      conversationId,
      { ...(dataRef.current?.memory ?? data.memory), dailyDay: today, dailyBriefing: text },
      REMOTE
    );
  }, [data, dailyBusy, conversationId, myHandle]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, thinking, data]);

  /* ------------------------------------------------------------- asking */
  const persistTurn = useCallback(
    (q: string, a: string) => {
      const turn: RoomTurn = { id: `rt_${Date.now().toString(36)}`, q, a, at: Date.now() };
      setTurns((prev) => {
        const next = [...prev, turn].slice(-5);
        if (!isOfflineNotice(a) && !saveRoomHistory(account?.id ?? null, conversationId, next.filter((t) => !isOfflineNotice(t.a)))) {
          // Keep it visible for the session; storage may be blocked or full.
          console.warn("Doremon history could not be saved on this device");
        }
        return next;
      });
    },
    [conversationId, account?.id]
  );

  const ask = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || !data || thinking || requestBusy.current) return;
      const generation = requestGeneration.current;
      const partner = data.partnerName;
      // token discipline: presence/system rows are noise, not conversation
      let recent = data.recent
        .filter((m) => m.kind !== "presence")
        .slice(-50)
        .map((m) => ({
          who: (m.senderId === data.meId ? "me" : "them") as "me" | "them",
          text: m.body || mediaLabel(m),
          at: m.at,
        }));

      const previous = turns.filter((turn) => !isOfflineNotice(turn.a));
      if (/^(?:repeat (?:your )?(?:last|previous) (?:answer|reply)|pichla jawab repeat karo)[.!?]*$/i.test(q) && previous.length) {
        setDraft("");
        persistTurn(q, `Previous answer (on this device): ${previous[previous.length - 1].a}`);
        return;
      }
      const lookup = !REMOTE || /^(?:search|find|dhundo)\b/i.test(q) ? localLookup(q, recent) : null;
      if (lookup) { setDraft(""); persistTurn(q, lookup); return; }

      requestBusy.current = true;
      const allowed = await confirmDoremonSharing(REMOTE);
      if (generation !== requestGeneration.current) return;
      if (!allowed) { requestBusy.current = false; return; }
      setDraft((current) => current.trim() === q ? "" : current);
      setThinking(true);
      setPendingQuestion({ text: q, at: Date.now() });
      if (REMOTE) {
        const fresh = await latestForAi(conversationId);
        if (generation !== requestGeneration.current) return;
        if (fresh) recent = fresh.messages.filter((m) => m.kind !== "presence").slice(-50)
          .map((m) => ({ who: m.senderId === fresh.me ? "me" as const : "them" as const, text: m.body || mediaLabel(m), at: m.at }));
      }
      let answer: string | null = null;
      let lastDetail: string | null = null;
      let retryAfter: number | null = null;
      let quotaScope: "day" | "minute" | "unknown" = "unknown";
      if (REMOTE) {
        brainAsked.current = true;
        const controller = new AbortController();
        activeRequest.current = controller;
        const timeout = setTimeout(() => controller.abort(), 50_000);
        try {
          const res = await doremonFetch({
            action: "roomAsk", sharing: "conversation-v1", me: myHandle, partner, meId: data.meId,
            partnerId: data.partnerId, recent, memory: { summary: data.memory.summary, chat: previous },
            stats: data.stats, question: q,
          }, controller.signal);
          const out = (await res.json()) as { ok?: boolean; answer?: string; error?: string; detail?: string; retryAfterSeconds?: number | null; quotaScope?: "day" | "minute" | "unknown" };
          if (generation !== requestGeneration.current) return;
          lastDetail = (out.error === "QUOTA" || out.error === "MODEL_QUOTA") ? out.error : out.detail ?? out.error ?? null;
          retryAfter = out.retryAfterSeconds ?? null;
          quotaScope = out.quotaScope ?? "unknown";
          if (res.ok && out.ok && out.answer) {
            answer = out.answer;
            setBrainState("online");
            setBrainDetail("");
          } else {
            setBrainDetail(offlineReason(lastDetail, retryAfter, quotaScope));
            setBrainState(out.error === "NO_KEY" ? "no-key" : out.error === "BAD_KEY" ? "bad-key" : "offline");
          }
        } catch (err) {
          if (generation !== requestGeneration.current) return;
          lastDetail = err instanceof Error && err.message === "DOREMON_AUTH_REQUIRED" ? "AUTH_REQUIRED" : err instanceof Error && err.name === "AbortError" ? "timeout" : "NETWORK";
          setBrainState("offline");
          setBrainDetail(offlineReason(lastDetail));
        } finally {
          clearTimeout(timeout);
        }
      }
      if (generation !== requestGeneration.current) return;
      if (!answer) {
        if (REMOTE) {
          // No canned demo answers in remote mode — an honest offline
          // status WITH THE REASON, so the room never parrots scripted
          // lines while the brain is down.
          const reason = offlineReason(lastDetail, retryAfter, quotaScope);
          answer = OFFLINE_NOTICE + (reason ? ` (${reason})` : "");
        } else {
          // Pure demo mode (no backend): the pocket brain IS the brain.
          answer = "I cannot answer from message details in demo mode. Try a specific keyword to search the loaded messages.";
        }
      }

      requestBusy.current = false;
      setThinking(false);
      setPendingQuestion(null);
      persistTurn(q, answer);
    },
    [data, thinking, myHandle, persistTurn, turns, conversationId]
  );

  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink">
        <DoremonFace size={40} className="animate-pulse-soft" />
      </main>
    );
  }

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden bg-[#09090B]" data-vivid-wallpaper={isVividChatTheme(theme) ? "true" : undefined} style={chatThemeStyle(theme)}>
      <ChatWallpaper theme={theme} reduceMotion={prefs.reduceMotion} />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      {/* header */}
      <header className="sticky top-0 z-30 shrink-0 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex h-[60px] w-full max-w-2xl items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => router.push("/app")}
            aria-label="Back to chats"
            className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center text-white transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={1.8} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <DoremonFace size={32} className="rounded-full" />
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[15px] font-semibold text-white">
                Doremon
              </h1>
              <p className="truncate text-[12px] text-zinc-400">Your private AI companion</p>
            </div>
          </div>
          <button ref={menuTrigger} type="button" onClick={() => setMenuOpen(true)} aria-label="Doremon menu" aria-expanded={menuOpen} className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><MoreHorizontal className="h-5 w-5" /></button>
        </div>
      </header>

      <AnimatePresence>
      {menuOpen && <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Doremon menu">
        <motion.button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70" />
        <motion.div ref={menuRef} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 34 }} className="relative w-full max-w-md rounded-t-[28px] bg-[#1C1C1E] p-5 pb-[max(24px,env(safe-area-inset-bottom))] sm:rounded-[28px]">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-medium text-white">Doremon</h2><button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-full p-2 text-zinc-400"><X className="h-4 w-4" /></button></div>
          <div className="flex flex-col text-sm text-zinc-200 [&>button]:flex [&>button]:items-center [&>button]:gap-3 [&>button]:rounded-xl [&>button]:px-3 [&>button]:py-3 [&>button:hover]:bg-white/5 [&>button:disabled]:opacity-40">
            <button type="button" disabled={!data.alive || memoryBusy} onClick={() => { setSummaryDraft(data.memory.summary); setEditingSummary(true); setMenuOpen(false); }}><Pencil className="h-4 w-4" /> Edit summary</button>
            <button type="button" onClick={() => {
              const blob = new Blob([JSON.stringify({ conversationId, exportedAt: new Date().toISOString(), memory: data.memory }, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `doremon-memory-${conversationId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMenuOpen(false);
            }}><Download className="h-4 w-4" /> Export memory</button>
            <button type="button" disabled={dailyBusy || data.memory.dailyDay === localDay()} onClick={() => { setMenuOpen(false); void runDaily(); }}><Sunrise className="h-4 w-4" /> {data.memory.dailyDay === localDay() ? "Today’s brief is ready" : "Write today’s brief"}</button>
            <button type="button" onClick={() => { music.toggle(); setMenuOpen(false); }}>{music.wantsPlayback ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {music.wantsPlayback ? "Stop room music" : "Play room music"}</button>
            <button type="button" disabled={memoryBusy} onClick={() => {
              if (!window.confirm("Delete your Doremon memory and this device’s Doremon chat for this conversation? Automatic analysis on any device can create a new memory. This cannot be undone.")) return;
              setMenuOpen(false); setMemoryBusy(true);
              void deleteDoremonMemory(conversationId, REMOTE, account?.id).then(() => { deleteRoomHistory(account?.id ?? null, conversationId); toast.success("Memory deleted"); router.push("/app"); }).catch(() => { toast.error("Could not delete memory. Try again."); setMemoryBusy(false); });
            }} className="text-rose-300"><Trash2 className="h-4 w-4" /> Delete memory</button>
          </div>
        </motion.div>
      </div>}
      </AnimatePresence>
      {editingSummary && <div className="mx-auto w-full max-w-2xl px-4 pt-3">
        <label htmlFor="memory-summary" className="text-xs text-zinc-400">Edit your summary (other memory fields are unchanged)</label>
        <textarea id="memory-summary" value={summaryDraft} maxLength={2000} onChange={(e) => setSummaryDraft(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-zinc-100" />
        <div className="mt-2 flex gap-2"><button type="button" disabled={memoryBusy} onClick={() => {
          setMemoryBusy(true);
          const next = { ...data.memory, summary: summaryDraft.trim(), updatedAt: Date.now() };
          void replaceDoremonMemory(conversationId, next, REMOTE).then(() => { setData((prev) => prev ? { ...prev, memory: next } : prev); setEditingSummary(false); toast.success("Summary saved"); }).catch(() => toast.error("Could not save summary. Try again.")).finally(() => setMemoryBusy(false));
        }} className="rounded-full bg-sky-500 px-4 py-2 text-xs text-white disabled:opacity-40">Save</button><button type="button" onClick={() => setEditingSummary(false)} className="px-3 text-xs text-zinc-400">Cancel</button></div>
      </div>}

      {brainState === "offline" && brainDetail && (
        <p role="status" className="mx-auto w-full max-w-2xl px-4 pt-2 text-[12px] leading-relaxed text-amber-200">{brainDetail}</p>
      )}

      {(music.state === "needs-tap" || music.state === "blocked") && <div role="status" className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 px-4 py-2 text-xs text-zinc-400"><span>{music.state === "needs-tap" ? "Your browser blocked autoplay." : "Room music couldn’t load."}</span><button type="button" onClick={music.play} className="rounded-full bg-white/10 px-3 py-1.5 text-zinc-200">Play music</button></div>}
      {/* hidden YouTube host — the player lives outside React's render tree */}
      <div ref={music.containerRef} aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" />

      {/* body */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[radial-gradient(ellipse_at_15%_30%,rgba(99,102,241,0.08),transparent_55%)]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4">
          {!data.alive && (
            <div className="rounded-[18px] border border-amber/25 bg-amber/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
              This conversation was deleted. Its saved memory may still be available here.
            </div>
          )}

          <details className="rounded-xl bg-black/60 p-3 text-sm text-zinc-200 backdrop-blur-md">
            <summary className="cursor-pointer text-zinc-400">About this conversation</summary>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-zinc-400">
              {dossier.length ? dossier.map((line, i) => <li key={i}>{line}</li>) : <li>There isn’t a record yet. It will grow as you chat.</li>}
            </ul>
          </details>
          {dailyBusy && <DoremonBubble text="I’m writing today’s brief…" at={Date.now()} />}
          {data.memory.dailyBriefing && !dailyBusy && <DoremonBubble text={`Here is your daily brief${data.memory.dailyDay ? ` · ${dayLabel(data.memory.dailyDay)}` : ""}:\n\n${data.memory.dailyBriefing}`} at={data.memory.updatedAt ?? Date.now()} />}

          {/* Q&A transcript */}
          {turns.map((t) => (
            <div key={t.id}>
              <UserBubble text={t.q} at={t.at} />
              <DoremonBubble text={t.a} at={t.at + 1} />
            </div>
          ))}

          {pendingQuestion && <UserBubble text={pendingQuestion.text} at={pendingQuestion.at} />}
          {thinking && <div className="flex items-end gap-2"><DoremonFace size={20} /><div role="status" className="flex items-center gap-2 rounded-[20px] rounded-tl-sm bg-[#1C1C1E] px-4 py-3 text-xs text-zinc-400"><span>Doremon is thinking</span><span className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <motion.span key={i} className="h-1 w-1 rounded-full bg-zinc-400" animate={{ y: [0, -3, 0] }} transition={{ duration: .9, repeat: Infinity, delay: i * .15 }} />)}</span></div></div>}
        </div>
      </div>

      <div className="shrink-0 bg-black/40 backdrop-blur-xl">
      {/* These prompts fill the draft only; they never send anything automatically. */}
      <div aria-label="Doremon prompt ideas" className="mx-auto flex w-full max-w-2xl gap-2 overflow-x-auto px-3 pt-2 pb-1">
        {[
          ["Recent recap", "Summarize the recent messages, without guessing how anyone feels."],
          ["Kind reply", "Suggest a kind reply to the recent conversation."],
          ["Conversation idea", "Suggest a thoughtful topic we could talk about next."],
        ].map(([label, question]) => (
          <button key={label} type="button" onClick={() => setDraft(question)} className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:bg-white/10">{label}</button>
        ))}
      </div>
      {/* input */}
      <p className="mx-auto w-full max-w-2xl px-4 pt-2 text-center text-[10px] leading-relaxed text-zinc-500">With your approval, Doremon sends your question, selected loaded messages, a short note and up to three previous exchanges to the external AI service. No attachments or full archive. This can include personal text; ask the other person first. Answers can be wrong. Last five exchanges are saved unencrypted on this device; older history may remain in your account.</p>
      <div>
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim() || thinking) return;
            void ask(draft);

          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!draft.trim() || thinking) return;
                void ask(draft);

              }
            }}
            rows={1}
            placeholder={`Ask Doremon about ${data.partnerName}…`}
            aria-label="Ask Doremon"
            className="max-h-32 flex-1 resize-none rounded-full bg-[#1C1C1E] px-4 py-3 text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking}
            aria-label="Send to Doremon"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FF5C7A] text-white transition-transform active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Send className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
          </button>
        </form>
      </div>
      </div>
      </div>
    </main>
  );
}

function UserBubble({ text, at }: { text: string; at: number }) {
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mt-3 flex justify-end"><div className="max-w-[85%] rounded-[20px] rounded-tr-sm bg-[#FF5C7A] px-4 py-2.5 text-[15px] leading-relaxed text-white"><p className="whitespace-pre-wrap break-words">{text}</p><p className="mt-1 text-right text-[10px] text-white/70">{clockTime(at)}</p></div></motion.div>;
}

function DoremonBubble({ text, at }: { text: string; at: number }) {
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="mt-3 flex w-full items-end gap-2"><DoremonFace size={20} /><div className="max-w-[85%] rounded-[20px] rounded-tl-sm bg-[#1C1C1E] px-4 py-2.5"><p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-200">{displayDoremonText(text)}</p><p className="mt-1 text-right text-[10px] text-zinc-500">{clockTime(at)}</p></div></motion.div>;
}
