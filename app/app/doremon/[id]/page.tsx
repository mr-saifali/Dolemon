"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Send } from "lucide-react";
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
import { dossierLines, localRoomAsk, viewStats, type StatsView } from "@/lib/doremon/insights";
import { emptyMemory, type DoremonMemory, type DoremonStats, type RoomTurn } from "@/lib/doremon/types";

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

function Room({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const { account } = useSession();
  const myHandle = account?.username ?? "you";

  const [data, setData] = useState<Loaded | null>(null);
  const [turns, setTurns] = useState<RoomTurn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      setTurns(next.memory.chat ?? []);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, thinking, data]);

  /* ------------------------------------------------------------- asking */
  const persistTurn = useCallback(
    (q: string, a: string) => {
      const turn: RoomTurn = { id: `rt_${Date.now().toString(36)}`, q, a, at: Date.now() };
      setTurns((prev) => [...prev, turn]);
      if (!REMOTE) return;
      setData((prev) => {
        if (!prev) return prev;
        const nextMemory: DoremonMemory = {
          ...prev.memory,
          partnerUsername: prev.partnerName,
          chat: [...(prev.memory.chat ?? []), turn].slice(-40),
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
      let answer: string | null = null;
      if (REMOTE) {
        try {
          // 12s hang-guard: if Gemini stalls, fall back to the local brain
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 12_000);
          const res = await fetch("/api/doremon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "roomAsk",
              me: myHandle,
              partner,
              meId: data.meId,
              partnerId: data.partnerId,
              recent,
              memory: data.memory,
              stats: data.stats,
              question: q,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const out = (await res.json()) as { ok?: boolean; answer?: string };
          if (res.ok && out.ok && out.answer) answer = out.answer;
        } catch {
          answer = null;
        }
      }
      if (!answer) answer = localRoomAsk(q, view, data.memory, partner);

      // a short beat so it reads as thought, not a parrot — kept snappy
      await new Promise((r) => setTimeout(r, 250));
      setThinking(false);
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
        </div>
      </header>

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

          {/* Q&A transcript */}
          {turns.map((t) => (
            <div key={t.id}>
              <UserBubble text={t.q} at={t.at} />
              <DoremonBubble text={t.a} at={t.at + 1} />
            </div>
          ))}

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
