"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { BrainCircuit, Plus, Sparkles } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { DoremonFace } from "@/components/chat/doremon";
import { ChatAvatar, ChatRow, type ChatRowData } from "@/components/home/chat-row";
import { HomeEmptyState } from "@/components/home/empty-state";
import { PeopleSearch } from "@/components/home/people-search";
import { StartChatSheet } from "@/components/home/start-chat-sheet";
import { authMode } from "@/lib/auth";
import { demoConversations } from "@/lib/chat";
import { useChatMeta } from "@/lib/conversation-meta";
import {
  conversationReadState,
  listConversations,
  openDirectConversation,
  type DbConversation,
} from "@/lib/db";
import { loadDoremonRecords, type DoremonRecord } from "@/lib/doremon/memory";
import { playIntroJingle } from "@/lib/sound";
import { SpatialRoom } from "@/components/personal/spatial-room";
import { greetingForProfile, openLoopsOf } from "@/lib/personal/core";
import { recordEvent, useLabs, useProfile } from "@/lib/personal/store";
import { useSession } from "@/lib/session";
import { usePrefs } from "@/lib/prefs";
import { lastMessageOf, previewFor, threadExists, unreadSince } from "@/lib/thread";
import type { ChatMessage } from "@/lib/thread";
import type { MessageStatus } from "@/lib/thread";

const REMOTE = authMode === "supabase";

function HomeScreen() {
  const router = useRouter();
  const { account } = useSession();
  const metaMap = useChatMeta();
  const { readReceipts, introMusic } = usePrefs();
  const profile = useProfile();
  const labs = useLabs();
  const [roomView, setRoomView] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [remoteChats, setRemoteChats] = useState<DbConversation[] | null>(null);
  /** per-conversation partner read cursor (live mode) — powers the list ticks */
  const [readStates, setReadStates] = useState<Record<string, number | null>>({});

  useEffect(() => {
    if (!REMOTE) return;
    let alive = true;
    listConversations()
      .then((rows) => alive && setRemoteChats(rows))
      .catch(() => alive && setRemoteChats([]));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    recordEvent("app.open");
  }, []);

  // The little opening jingle — once per app session, not per visit.
  useEffect(() => {
    if (!introMusic) return;
    try {
      const seen = window.sessionStorage.getItem("dolemon:intro-played");
      if (seen) return;
      window.sessionStorage.setItem("dolemon:intro-played", "1");
    } catch {
      // storage unavailable — fall through, the jingle is harmless to play
    }
    playIntroJingle(profile.selfChord);
  }, [introMusic, profile.selfChord]);

  // When the list changes, learn where each partner's read cursor sits.
  useEffect(() => {
    if (!REMOTE || !remoteChats) return;
    let alive = true;
    void Promise.all(
      remoteChats.map(async (c) => {
        const at = await conversationReadState(c.id).catch(() => null);
        return [c.id, at] as const;
      })
    ).then((entries) => {
      if (!alive) return;
      setReadStates((prev) => {
        const next = { ...prev };
        for (const [id, at] of entries) next[id] = at;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [remoteChats]);

  // Doremon's memory — the records he keeps, including chats that are deleted.
  const [doremonRecords, setDoremonRecords] = useState<DoremonRecord[]>([]);
  useEffect(() => {
    if (!REMOTE) return;
    let alive = true;
    loadDoremonRecords(REMOTE)
      .then((records) => {
        if (alive) setDoremonRecords(records);
      })
      .catch(() => {
        if (alive) setDoremonRecords([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const rows = useMemo<ChatRowData[]>(() => {
    if (REMOTE) {
      const myId = account?.id ?? null;
      return (remoteChats ?? []).map((c) => {
        const lastMine = myId != null && c.lastSender === myId;
        const cursor = readStates[c.id] ?? null;
        const seen = lastMine && c.lastAt != null && cursor != null && cursor >= c.lastAt;
        return {
          id: c.id,
          name: c.partnerUsername,
          handle: c.partnerUsername,
          avatarId: c.partnerAvatar,
          avatarUrl: c.partnerAvatarUrl,
          preview: previewOf(c),
          at: c.lastAt,
          unread: c.unread,
          lastMine,
          lastStatus: lastMine ? (readReceipts && seen ? "read" : "delivered") : null,
        };
      });
    }

    return demoConversations()
      .filter((c) => !metaMap[c.id]?.deleted)
      .map((c) => {
        const meta = metaMap[c.id];
        // The list always shows the *actual* last line of the thread — what you
        // sent, what they sent — not a frozen seed.
        const last = lastMessageOf(c.id);
        const unread = meta?.lastReadAt
          ? unreadSince(c.id, meta.lastReadAt)
          : (meta?.unread ?? c.unread);
        const lastStatus: MessageStatus | null =
          last?.author === "me" && last.status
            ? readReceipts
              ? last.status
              : last.status === "read"
                ? "delivered"
                : last.status
            : null;
        return {
          id: c.id,
          name: c.name,
          handle: c.username,
          avatarId: c.avatarId,
          preview: previewForConversation(c, last, c.id),
          at: last?.at ?? c.lastAt,
          unread,
          typing: meta?.muted ? false : c.typing,
          lastMine: last?.author === "me",
          lastStatus,
        };
      })
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }, [remoteChats, metaMap, readStates, readReceipts, account?.id]);

  const openLoops = useMemo(
    () => doremonRecords.flatMap((rec) => openLoopsOf(rec.memory.graph).map((loop) => ({ id: loop.id, text: loop.text }))),
    [doremonRecords]
  );
  const tension = doremonRecords[0]?.memory.tension ?? 0;

  const startChat = async (handle: string) => {
    setStartError(null);
    setStarting(true);
    try {
      const id = await openDirectConversation(handle);
      setSheetOpen(false);
      router.push(`/app/chat/${id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't open that chat.");
    } finally {
      setStarting(false);
    }
  };

  const openStart = () => {
    setStartError(null);
    setSheetOpen(true);
  };

  const startSheet = (
    <StartChatSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onStart={REMOTE ? startChat : undefined}
      demoPeople={
        REMOTE
          ? undefined
          : demoConversations().map((c) => ({ id: c.id, handle: c.username, avatarId: c.avatarId }))
      }
      onPickDemo={(id) => router.push(`/app/chat/${id}`)}
      starting={starting}
      error={startError}
      myHandle={account?.username ?? null}
    />
  );

  // Home is a room, not a list. The inbox is still one tap away.
  if (labs["home.room"] && roomView) {
    return (
      <>
        <SpatialRoom
          rows={rows}
          accountName={account?.username ?? profile.name}
          openLoops={openLoops}
          tension={tension}
          onOpenStart={openStart}
          onToggleList={() => setRoomView(false)}
          onOpenChat={(id) => router.push(`/app/chat/${id}`)}
          onOpenDoremon={() =>
            doremonRecords[0]
              ? router.push(`/app/doremon/${doremonRecords[0].conversationId}`)
              : router.push("/app/brain")
          }
        />
        {startSheet}
      </>
    );
  }

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#09090B]">
      {/* warm glow, top right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-36 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.16),rgba(255,140,90,0.06)_45%,transparent_72%)]"
      />
      {/* cool counterweight, bottom left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-44 -left-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(104,120,255,0.13),rgba(150,92,255,0.05)_50%,transparent_72%)]"
      />
      {/* soft sheen along the top edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(120%_100%_at_50%_0%,rgba(255,92,122,0.09),transparent_72%)]"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 safe-t">
        <header className="flex items-center justify-between gap-3 pb-5 pt-9">
          <div className="min-w-0">
            <p className="wordmark flex items-center gap-1.5 text-[10px] font-medium uppercase text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
              Dolemon
            </p>
            <motion.h1
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1.5 min-w-0 truncate text-2xl font-light leading-tight tracking-[-0.01em] text-zinc-100"
            >
              {greetingForProfile(profile)}
              {!profile.nickname && (
                <>
                  , <span className="text-brand font-normal">@{account?.username ?? "you"}</span>
                </>
              )}
            </motion.h1>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {labs["home.room"] && (
              <button
                type="button"
                onClick={() => setRoomView(true)}
                aria-label="Back to your room"
                className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white active:scale-95"
              >
                <Sparkles className="h-[18px] w-[18px]" />
              </button>
            )}
            <Link
              href="/app/brain"
              aria-label="Your brain"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white active:scale-95"
            >
              <BrainCircuit className="h-[18px] w-[18px]" />
            </Link>

            <button
              type="button"
              onClick={openStart}
              aria-label="Start a conversation"
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={1.6} />
            </button>

            <Link
              href="/settings"
              aria-label="Profile and settings"
              className="rounded-2xl transition-transform active:scale-95"
            >
              <ChatAvatar
                avatarId={account?.avatarId ?? null}
                avatarUrl={account?.avatarUrl ?? null}
                name={account?.username ?? "you"}
                size={36}
              />
            </Link>
          </div>
        </header>

        {REMOTE && (
          <div className="pb-5">
            <PeopleSearch onPick={(username) => void startChat(username)} />
          </div>
        )}

        <div className="flex-1 pb-10">
          {rows.length === 0 ? (
            <HomeEmptyState onInvite={openStart} />
          ) : (
            <div className="flex flex-col">
              {rows.map((chat, i) => (
                <ChatRow key={chat.id} chat={chat} index={i} />
              ))}
            </div>
          )}

          {/* Doremon's memory — his private records, including deleted chats */}
          {doremonRecords.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                <DoremonFace size={16} /> Doremon&apos;s memory
              </p>
              <div className="flex flex-col">
                {doremonRecords.slice(0, 6).map((rec) => {
                  const name = rec.memory.partnerUsername || "a deleted chat";
                  return (
                    <Link
                      key={rec.conversationId}
                      href={`/app/doremon/${rec.conversationId}`}
                      className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/[0.04]"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(41,171,226,0.12)" }}>
                        <DoremonFace size={30} />
                      </div>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[14px] font-medium text-zinc-200">
                          {name}
                          {!rec.alive && (
                            <span className="ml-2 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                              deleted
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[12.5px] text-zinc-500">
                          {rec.memory.summary || rec.memory.finalSummary || "keeps watching…"}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {startSheet}
    </main>
  );
}

function previewOf(c: DbConversation) {
  if (c.lastKind === "image") return "📷 Photo";
  if (c.lastKind === "audio") return "🎙️ Voice note";
  if (c.lastKind === "file") return c.lastBody ? `📎 ${c.lastBody}` : "📎 File";
  if (c.lastKind === "sticker") return "Sent a reaction";
  if (!c.lastBody) return "Say something. No one else is reading.";
  return c.lastBody;
}

/** Demo rows read the real thread, so the preview is honest about who spoke last. */
function previewForConversation(
  c: { lastMessage: string },
  last: ChatMessage | null,
  conversationId: string
): string {
  if (!last) {
    // A thread that was opened then cleared reads as empty, not as the old seed.
    return threadExists(conversationId) ? "Say something. No one else is reading." : c.lastMessage;
  }
  const base = previewFor(last);
  return last.author === "me" && last.kind === "text" ? `You: ${base}` : base;
}

export default function HomePage() {
  return (
    <AppGuard>
      <HomeScreen />
    </AppGuard>
  );
}
