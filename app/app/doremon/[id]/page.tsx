"use client";

import { doremonFetch } from "@/lib/doremon/api";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Play, Send, Sunrise, Volume2, VolumeX } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { DoremonFace } from "@/components/chat/doremon";
import { authMode } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { loadThread, listConversations, type DbMessage } from "@/lib/db";
import { clockTime } from "@/lib/thread";
import {
  loadDoremonMemory,
  loadDoremonStats,
  saveDoremonMemory,
} from "@/lib/doremon/memory";
import {
  dossierLines,
  localDailyBriefing,
  localRoomAsk,
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

/** Split a briefing into its labelled lines; falls back to plain paragraphs. */
function dailyLines(text: string): { label: string | null; body: string }[] {
  const out: { label: string | null; body: string }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(YESTERDAY|NOW|TOMORROW)\s*[—–-]\s*(.*)$/i);
    if (m) {
      out.push({ label: m[1].toUpperCase(), body: m[2] });
    } else if (out.length > 0) {
      out[out.length - 1].body += (out[out.length - 1].body ? " " : "") + line;
    } else {
      out.push({ label: null, body: line });
    }
  }
  return out;
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

/* ------------------------------------------------------------------ */
/* Room music — the full track, on loop, stopped from the header.      */
/* Played through the official YouTube IFrame player: the audio of the */
/* real track, the video hidden. Needs the device's internet.          */
/* ------------------------------------------------------------------ */

const ROOM_MUSIC_VIDEO_ID = "5ozrYtnqgDo";

type YtPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};

type YtNamespace = {
  Player: new (el: HTMLElement, options: Record<string, unknown>) => YtPlayer;
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YtNamespace> | null = null;

function loadYouTubeApi(): Promise<YtNamespace> {
  const w = window as Window;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<YtNamespace>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ytApiPromise = null;
      reject(new Error("YouTube player took too long to load"));
    }, 12000);
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      previous?.();
      if (w.YT?.Player) resolve(w.YT);
      else {
        ytApiPromise = null;
        reject(new Error("YouTube player unavailable"));
      }
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timer);
      ytApiPromise = null;
      reject(new Error("Could not reach YouTube — music needs internet"));
    };
    document.head.appendChild(script);
  });
  return ytApiPromise;
}

type RoomMusicState = "loading" | "playing" | "paused" | "needs-tap" | "blocked";

type RoomMusic = {
  state: RoomMusicState;
  /** Hidden player host — render this container exactly once. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Play or stop the track from the header. */
  toggle(): void;
};

/**
 * The room's looping track. The YouTube player replaces its host element with
 * an <iframe>, so the host is created imperatively inside a stable
 * React-managed container that React never renders children into.
 */
function useRoomMusic(): RoomMusic {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const autoplayTimer = useRef<number | null>(null);
  const [state, setState] = useState<RoomMusicState>("loading");

  const creatingRef = useRef<Promise<YtPlayer | null> | null>(null);

  const ensurePlayer = useCallback(async (): Promise<YtPlayer | null> => {
    if (playerRef.current) return playerRef.current;
    if (creatingRef.current) return creatingRef.current;
    const creating = (async (): Promise<YtPlayer | null> => {
      const container = containerRef.current;
      if (!container) return null;
      let yt: YtNamespace;
      try {
        yt = await loadYouTubeApi();
      } catch {
        setState("blocked");
        return null;
      }
      if (playerRef.current) return playerRef.current;
      const host = document.createElement("div");
      container.appendChild(host);
      const player = new yt.Player(host, {
        width: "1",
        height: "1",
        videoId: ROOM_MUSIC_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          loop: 1,
          playlist: ROOM_MUSIC_VIDEO_ID,
          controls: 0,
          playsinline: 1,
          rel: 0,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            player.playVideo();
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === 1) {
              if (autoplayTimer.current !== null) {
                window.clearTimeout(autoplayTimer.current);
                autoplayTimer.current = null;
              }
              setState("playing");
            }
          },
        },
      });
      playerRef.current = player;
      // If the player has not started within 4s, the browser is almost
      // certainly holding the autoplay (no user gesture on this page yet).
      autoplayTimer.current = window.setTimeout(() => {
        setState((s) => (s === "loading" ? "needs-tap" : s));
      }, 4000);
      return player;
    })();
    creatingRef.current = creating;
    const result = await creating;
    if (result === null) creatingRef.current = null; // allow a retry
    return result;
  }, []);

  useEffect(() => {
    void ensurePlayer();
    const container = containerRef.current;
    return () => {
      if (autoplayTimer.current !== null) window.clearTimeout(autoplayTimer.current);
      playerRef.current?.destroy();
      playerRef.current = null;
      container?.replaceChildren();
    };
  }, [ensurePlayer]);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    if (!player) {
      void ensurePlayer().then((p) => p?.playVideo());
      return;
    }
    if (state === "playing") {
      player.pauseVideo();
      setState("paused");
    } else {
      player.playVideo();
    }
  }, [ensurePlayer, state]);

  return { state, containerRef, toggle };
}

export default function DoremonRoomPage({ params }: { params: { id: string } }) {
  return (
    <AppGuard>
      <Room conversationId={params.id} />
    </AppGuard>
  );
}

type BrainState = "unknown" | "ready" | "online" | "no-key" | "bad-key" | "offline" | "demo";

const BRAIN_LABEL: Record<BrainState, string> = {
  unknown: "",
  ready: "key connected",
  online: "online",
  "no-key": "no key",
  "bad-key": "key rejected",
  offline: "couldn't answer",
  demo: "demo · local",
};

const BRAIN_DETAIL: Record<BrainState, string> = {
  unknown: "",
  ready: "Google accepted the key; model availability and quota are checked on the first question.",
  online: "Gemini is answering live.",
  "no-key": "GEMINI_API_KEY is not set. Live answers require a key.",
  "bad-key": "Google rejected the key or its permissions. Check the key and project access.",
  offline: "Gemini could not answer. Check the reason or try again later.",
  demo: "Demo mode has no backend, so Doremon runs on his pocket (local) brain.",
};

function Room({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { account } = useSession();
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
  const [dailyBusy, setDailyBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const music = useRoomMusic();
  const dataRef = useRef<Loaded | null>(null);
  dataRef.current = data;

  // Demo mode never calls the API — his brain is the local one, by design.
  useEffect(() => {
    if (!REMOTE) setBrainState("demo");
  }, []);

  // Ask the brain itself how it's doing the moment the room opens, so the
  // header chip is true BEFORE the first question (the first answer still
  // overrides it with ground truth).
  useEffect(() => {
    if (!REMOTE) return;
    let alive = true;
    fetch("/api/doremon")
      .then((r) => r.json() as Promise<{ ok?: boolean; error?: string; detail?: string }>)
      .then((out) => {
        if (!alive || brainAsked.current) return;
        setBrainState((s) => {
          if (s !== "unknown") return s;
          if (out.ok) return "ready";
          if (out.error === "NO_KEY") return "no-key";
          if (out.error === "BAD_KEY") return "bad-key";
          return "offline";
        });
        if (out.ok) setBrainDetail("");
        else if (out.detail) setBrainDetail(out.detail);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [conversationId]);

  /* ------------------------------------------------------------ load room */
  useEffect(() => {
    let alive = true;
    (async () => {
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
      setTurns((next.memory.chat ?? []).filter((t) => !isOfflineNotice(t.a)));
    })();
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const view: StatsView = useMemo(
    () => viewStats(data?.stats ?? null, data?.meId ?? null, data?.partnerId ?? null),
    [data?.stats, data?.meId, data?.partnerId]
  );

  const dossier = useMemo(
    () => (data ? dossierLines(view, data.memory, data.partnerName) : []),
    [data, view]
  );

  // Doremon's daily briefing — what happened, what's happening, what's coming.
  // WRITTEN ONLY ON TAP (the Sunrise button): one deliberate call per day,
  // never automatic. Opening the room no longer triggers any AI call.
  const runDaily = useCallback(async () => {
    if (!data || dailyBusy) return;
    const today = localDay();
    if (data.memory.dailyDay === today) return;
    setDailyBusy(true);
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const yesterday = data.recent
      .filter((m) => m.kind !== "presence" && m.at > dayAgo)
      .slice(-12)
      .map((m) => ({
        who: (m.senderId === data.meId ? "me" : "them") as "me" | "them",
        text: m.body || mediaLabel(m),
      }));
    let text: string | null = null;
    if (REMOTE) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 50_000);
      try {
        const res = await doremonFetch({
          action: "daily",
          me: myHandle,
          partner: data.partnerName,
          meId: data.meId,
          partnerId: data.partnerId,
          recent: [],
          yesterday,
          day: today,
          memory: data.memory,
          stats: data.stats,
        }, controller.signal);
        const out = (await res.json()) as { ok?: boolean; answer?: string };
        if (res.ok && out.ok && out.answer) text = out.answer;
      } catch {
        // offline / timeout — his pocket brain still writes the day (free)
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!text) text = localDailyBriefing(view, data.memory, data.partnerName, yesterday);
    setDailyBusy(false);
    // land the two daily fields on whatever the FRESHEST memory is
    setData((prev) => (prev ? { ...prev, memory: { ...prev.memory, dailyDay: today, dailyBriefing: text } } : prev));
    void saveDoremonMemory(
      conversationId,
      { ...(dataRef.current?.memory ?? data.memory), dailyDay: today, dailyBriefing: text },
      REMOTE
    );
  }, [data, dailyBusy, conversationId, myHandle, view]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, thinking, data]);

  /* ------------------------------------------------------------- asking */
  const persistTurn = useCallback(
    (q: string, a: string) => {
      const turn: RoomTurn = { id: `rt_${Date.now().toString(36)}`, q, a, at: Date.now() };
      setTurns((prev) => [...prev, turn]);
      // The offline notice is live feedback, not conversation — it shows on
      // screen but is never written to the room's saved history.
      if (isOfflineNotice(a) || !REMOTE) return;
      setData((prev) => {
        if (!prev) return prev;
        const nextMemory: DoremonMemory = {
          ...prev.memory,
          partnerUsername: prev.partnerName,
          chat: [...(prev.memory.chat ?? []).filter((t) => !isOfflineNotice(t.a)), turn].slice(-40),
          updatedAt: Date.now(),
        };
        void saveDoremonMemory(conversationId, nextMemory, REMOTE);
        return { ...prev, memory: nextMemory };
      });
    },
    [conversationId]
  );

  const ask = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || !data || thinking) return;
      const partner = data.partnerName;
      // token discipline: presence/system rows are noise, not conversation
      const recent = data.recent
        .filter((m) => m.kind !== "presence")
        .slice(-16)
        .map((m) => ({
          who: (m.senderId === data.meId ? "me" : "them") as "me" | "them",
          text: m.body || mediaLabel(m),
        }));

      setThinking(true);
      setPendingQuestion({ text: q, at: Date.now() });
      let answer: string | null = null;
      let lastDetail: string | null = null;
      let retryAfter: number | null = null;
      let quotaScope: "day" | "minute" | "unknown" = "unknown";
      if (REMOTE) {
        brainAsked.current = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 50_000);
        try {
          const res = await doremonFetch({
            action: "roomAsk", me: myHandle, partner, meId: data.meId,
            partnerId: data.partnerId, recent, memory: data.memory,
            stats: data.stats, question: q,
          }, controller.signal);
          const out = (await res.json()) as { ok?: boolean; answer?: string; error?: string; detail?: string; retryAfterSeconds?: number | null; quotaScope?: "day" | "minute" | "unknown" };
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
          lastDetail = err instanceof Error && err.message === "DOREMON_AUTH_REQUIRED" ? "AUTH_REQUIRED" : err instanceof Error && err.name === "AbortError" ? "timeout" : "NETWORK";
          setBrainState("offline");
          setBrainDetail(offlineReason(lastDetail));
        } finally {
          clearTimeout(timeout);
        }
      }
      if (!answer) {
        if (REMOTE) {
          // No canned demo answers in remote mode — an honest offline
          // status WITH THE REASON, so the room never parrots scripted
          // lines while the brain is down.
          const reason = offlineReason(lastDetail, retryAfter, quotaScope);
          answer = OFFLINE_NOTICE + (reason ? ` (${reason})` : "");
        } else {
          // Pure demo mode (no backend): the pocket brain IS the brain.
          answer = localRoomAsk(q, view, data.memory, partner);
        }
      }

      setThinking(false);
      setPendingQuestion(null);
      persistTurn(q, answer);
    },
    [data, thinking, myHandle, view, persistTurn]
  );

  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-ink">
        <DoremonFace size={40} className="animate-pulse-soft" />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-ink">
      {/* header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#09090B]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => router.push("/app")}
            aria-label="Back to chats"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <DoremonFace size={38} />
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[15px] font-medium tracking-[-0.01em] text-zinc-100">
                Doremon
              </h1>
              <p className="truncate text-[12px] text-[#8FD9F8]">
                {data.alive ? `your private room · about ${data.partnerName}` : `a deleted chat · about ${data.partnerName}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {brainState !== "unknown" && (
              <span
                title={brainDetail || BRAIN_DETAIL[brainState]}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-[3px] text-[10.5px] font-medium ${
                  brainState === "online"
                    ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                    : "border-amber-400/25 bg-amber-400/10 text-amber-200"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${
                    brainState === "online" ? "bg-emerald-400" : "animate-pulse bg-amber-400"
                  }`}
                />
                {BRAIN_LABEL[brainState]}
              </span>
            )}
            <button
              type="button"
              onClick={music.toggle}
              aria-label={music.state === "playing" ? "Stop room music" : "Play room music"}
              title={music.state === "playing" ? "Stop the room music" : "Play the room music on loop"}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-[#8FD9F8] active:scale-90"
            >
              {music.state === "playing" ? (
                <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.8} />
              ) : (
                <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>
      </header>

      {brainState === "offline" && brainDetail && (
        <p role="status" className="mx-auto w-full max-w-2xl px-4 pt-2 text-[12px] leading-relaxed text-amber-200">{brainDetail}</p>
      )}

      {/* the room track — autoplay was blocked or YouTube is unreachable */}
      {(music.state === "needs-tap" || music.state === "blocked") && (
        <div className="mx-auto w-full max-w-2xl px-3 pt-2">
          {music.state === "needs-tap" ? (
            <button
              type="button"
              onClick={music.toggle}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-[#29ABE2]/30 bg-[#29ABE2]/10 px-3 py-2 text-[12.5px] font-medium text-[#8FD9F8] transition active:scale-[0.99]"
            >
              <Play className="h-3.5 w-3.5" /> Tap to start the room music
            </button>
          ) : (
            <p className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[12px] text-zinc-500">
              Room music plays through YouTube — it needs internet.
            </p>
          )}
        </div>
      )}

      {/* hidden YouTube host — the player lives outside React's render tree */}
      <div ref={music.containerRef} aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" />

      {/* body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4">
          {!data.alive && (
            <div className="rounded-[18px] border border-amber/25 bg-amber/10 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-200">
              This chat is gone — but I keep every record. What you ask me here, I answer from my pocket, not from the thread.
            </div>
          )}

          {/* the dossier card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28 }}
            className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8FD9F8]">
                My record
              </span>
              <span className="text-[11px] text-zinc-500">· about {data.partnerName}</span>
            </div>
            <ul className="space-y-1.5">
              {dossier.length === 0 ? (
                <li className="text-[13px] leading-relaxed text-zinc-400">
                  Is chat ka record abhi meri 4D memory mein nahi banta — pehle thodi baat hoti hai. Phir har line, har timing, har mood, future-grade precision se yaad rahega. 🐱
                </li>
              ) : (
                dossier.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-zinc-300">
                    <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#29ABE2]/70" />
                    <span className="whitespace-pre-wrap">{line}</span>
                  </li>
                ))
              )}
            </ul>
          </motion.div>

          {/* Doremon's daily — what happened, what's happening, what's coming.
              Written only when tapped: one deliberate call per day, never hidden. */}
          {data.memory.dailyDay !== localDay() && !dailyBusy && (
            <button
              onClick={() => void runDaily()}
              className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-amber-200/15 bg-amber-400/[0.04] px-4 py-3 text-[12.5px] font-medium text-amber-200/90 transition-colors active:bg-amber-400/[0.08]"
            >
              <Sunrise className="h-4 w-4" strokeWidth={1.8} />
              Write today&apos;s brief
            </button>
          )}
          {dailyBusy && (
            <div className="flex items-center gap-2.5 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
              <Sunrise className="h-4 w-4 animate-pulse-soft text-amber-300" strokeWidth={1.8} />
              <span className="text-[12.5px] text-zinc-400">Doremon is writing today&apos;s brief…</span>
            </div>
          )}
          {data.memory.dailyBriefing && !dailyBusy && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.08 }}
              className="rounded-[20px] border border-amber-200/10 bg-amber-400/[0.04] p-4"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <Sunrise className="h-3.5 w-3.5 text-amber-300" strokeWidth={1.8} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-200/90">
                  My daily
                </span>
                {data.memory.dailyDay && (
                  <span className="text-[11px] text-zinc-500">· {dayLabel(data.memory.dailyDay)}</span>
                )}
              </div>
              <div className="space-y-2">
                {dailyLines(data.memory.dailyBriefing).map((line, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-zinc-300">
                    {line.label && (
                      <span
                        className={`mr-1.5 text-[10.5px] font-semibold tracking-[0.08em] ${
                          line.label === "YESTERDAY"
                            ? "text-rose-300/90"
                            : line.label === "NOW"
                              ? "text-sky-300/90"
                              : "text-violet-300/90"
                        }`}
                      >
                        {line.label}
                      </span>
                    )}
                    <span className="whitespace-pre-wrap">{line.body}</span>
                  </p>
                ))}
              </div>
            </motion.div>
          )}

          {/* Q&A transcript */}
          {turns.map((t) => (
            <div key={t.id}>
              <UserBubble text={t.q} at={t.at} />
              <DoremonBubble text={t.a} at={t.at + 1} />
            </div>
          ))}

          {pendingQuestion && <UserBubble text={pendingQuestion.text} at={pendingQuestion.at} />}
          {thinking && (
            <div className="flex w-full justify-start">
              <div className="flex items-center gap-2.5 rounded-[20px] rounded-bl-[4px] px-4 py-3" style={{ background: "rgba(41,171,226,0.10)", boxShadow: "inset 0 0 0 1px rgba(41,171,226,0.35)" }}>
                <DoremonFace size={20} className="animate-pulse-soft" />
                <span className="text-[13px] text-[#8FD9F8]">Doremon soch raha hai</span>
                <span className="flex items-center gap-0.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1 w-1 rounded-full bg-[#8FD9F8]"
                      animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* input */}
      <div className="border-t border-white/5 bg-[#09090B]/80 backdrop-blur-xl">
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2 px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim() || thinking) return;
            void ask(draft);
            setDraft("");
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
                setDraft("");
              }
            }}
            rows={1}
            placeholder={`Ask Doremon about ${data.partnerName}…`}
            aria-label="Ask Doremon"
            className="max-h-32 flex-1 resize-none rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[14.5px] text-zinc-100 placeholder:text-zinc-500 focus:border-[#29ABE2]/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || thinking}
            aria-label="Send to Doremon"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40"
            style={{ background: "linear-gradient(160deg, #29ABE2, #1B87B5)" }}
          >
            <Send className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
          </button>
        </form>
      </div>
    </main>
  );
}

function UserBubble({ text, at }: { text: string; at: number }) {
  return (
    <div className="mt-2 flex justify-end">
      <div
        className="max-w-[85%] rounded-[20px] rounded-br-[4px] px-3.5 py-2.5 text-[14.5px] leading-relaxed text-white"
        style={{ background: "var(--sent-bg)", boxShadow: "var(--sent-rim), var(--sent-glow)" }}
      >
        <p className="whitespace-pre-wrap break-words">{text}</p>
        <p className="mt-0.5 text-right text-[10px] leading-none tabular-nums text-white/50">{clockTime(at)}</p>
      </div>
    </div>
  );
}

function DoremonBubble({ text, at }: { text: string; at: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, x: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={SPRING}
      className="mt-2 flex w-full justify-start"
    >
      <div
        className="relative flex max-w-[85%] flex-col items-start rounded-[20px] rounded-bl-[4px] border px-3.5 py-2.5"
        style={{ background: "rgba(41,171,226,0.10)", boxShadow: "inset 0 0 0 1px rgba(41,171,226,0.35)" }}
      >
        <div className="flex w-full items-center gap-2">
          <DoremonFace size={18} />
          <span className="text-[11px] font-medium tracking-wide text-[#8FD9F8]">Doremon</span>
          <span className="ml-auto text-[10px] leading-none tabular-nums text-white/40">{clockTime(at)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-zinc-100">{text}</p>
      </div>
    </motion.div>
  );
}
