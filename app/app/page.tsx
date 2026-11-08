"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { usePwa } from "@/components/pwa/pwa-provider";
import { AppGuard } from "@/components/app-guard";
import { DoremonFace } from "@/components/chat/doremon";
import { ChatAvatar, ChatRow, type ChatRowData } from "@/components/home/chat-row";
import { HomeEmptyState } from "@/components/home/empty-state";
import { PeopleSearch } from "@/components/home/people-search";
import { StartChatSheet } from "@/components/home/start-chat-sheet";
import { authMode } from "@/lib/auth";
import { demoConversations, greetingFor } from "@/lib/chat";
import { useChatMeta } from "@/lib/conversation-meta";
import {
  listConversations,
  openDirectConversation,
  watchInbox,
  type DbConversation,
} from "@/lib/db";
import { loadDoremonRecords, type DoremonRecord } from "@/lib/doremon/memory";
import { askShellPermissionsOnce } from "@/lib/android-app";
import { REFRESH_EVENT } from "@/lib/pull-to-refresh";
import { playIntroJingle } from "@/lib/sound";
import { useSession } from "@/lib/session";
import { useAppPresence } from "@/lib/app-presence";
import { usePrefs } from "@/lib/prefs";
import { lastMessageOf, previewFor, threadExists, unreadSince } from "@/lib/thread";
import type { ChatMessage } from "@/lib/thread";

const REMOTE = authMode === "supabase";

function HomeScreen() {
  useEffect(() => { askShellPermissionsOnce(); }, []);
  const router = useRouter();
  const { account } = useSession();
  const presence = useAppPresence();
  const metaMap = useChatMeta();
  const { introMusic } = usePrefs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [remoteChats, setRemoteChats] = useState<DbConversation[] | null>(null);
  const [inboxError, setInboxError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!REMOTE) return;
    let alive = true;
    listConversations()
      .then((rows) => {
        if (!alive) return;
        setRemoteChats(rows);
        setInboxError(false);
        // Warm the routes the user is most likely to open, so tapping a chat
        // works even if the connection drops before they get there.
        for (const row of rows.slice(0, 8)) {
          router.prefetch(`/app/chat/${row.id}`);
          router.prefetch(`/app/doremon/${row.id}`);
        }
      })
      .catch(() => { if (alive) setInboxError(true); });
    return () => {
      alive = false;
    };
  }, [router]);

  // Swipe-down-to-refresh (see PullToRefresh) re-reads the inbox on demand.
  const refreshInbox = useCallback(() => {
    if (!REMOTE) return;
    return listConversations()
      .then((rows) => { setRemoteChats(rows); setInboxError(false); })
      .catch(() => setInboxError(true));
  }, []);
  useEffect(() => {
    const onPull = () => { void refreshInbox(); };
    window.addEventListener(REFRESH_EVENT, onPull);
    return () => window.removeEventListener(REFRESH_EVENT, onPull);
  }, [refreshInbox]);

  // Reconcile inbox previews after live changes, reconnects and returning
  // from the background. Keep the previous list if a refresh fails.
  useEffect(() => {
    if (!REMOTE) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void listConversations().then((rows) => { if (alive) { setRemoteChats(rows); setInboxError(false); } }).catch(() => { if (alive) setInboxError(true); });
      }, 250);
    };
    const stop = watchInbox(refresh);
    const resume = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", refresh);
    return () => { alive = false; if (timer) clearTimeout(timer); stop(); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", refresh); };
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
    playIntroJingle();
  }, [introMusic]);

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
      return (remoteChats ?? []).map((c) => {
        return {
          id: c.id,
          name: c.partnerUsername,
          handle: c.partnerUsername,
          avatarId: c.partnerAvatar,
          avatarUrl: c.partnerAvatarUrl,
          preview: previewOf(c),
          at: c.lastAt,
          unread: c.unread,
          online: presence[c.id] === "online",
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
        return {
          id: c.id,
          name: c.name,
          handle: c.username,
          avatarId: c.avatarId,
          preview: previewForConversation(c, last, c.id),
          at: last?.at ?? c.lastAt,
          unread,
          typing: meta?.muted ? false : c.typing,
          online: c.online,
        };
      })
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }, [remoteChats, metaMap, presence]);
  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase().replace(/^@/, "");
    return term ? rows.filter((chat) => `${chat.name} ${chat.handle} ${chat.preview}`.toLowerCase().includes(term)) : rows;
  }, [rows, search]);

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

  const { androidApp, environmentReady } = usePwa();

  const openStart = () => {
    setStartError(null);
    setSheetOpen(true);
  };

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden bg-[#09090B]">
      <div className="relative z-10 mx-auto flex h-dvh w-full max-w-md flex-col overflow-y-auto overscroll-contain px-6">
        <header className="sticky top-0 z-30 -mx-6 bg-[#09090B]/90 px-6 pb-4 pt-[max(env(safe-area-inset-top),20px)] backdrop-blur-xl">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,92,122,0.09),transparent_70%)]" />
          <div className="relative flex items-center justify-between gap-4 pb-6 pt-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-zinc-500">Dolemon</p>
              <motion.h1 initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mt-2 break-words text-2xl font-medium leading-tight text-white">
                {greetingFor()},{" "}<span className="bg-gradient-to-r from-[#F5C992] to-[#FF829C] bg-clip-text text-transparent">@{account?.username ?? "you"}</span>
              </motion.h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {environmentReady && !androidApp && <Link href="/download" className="flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/5" aria-label="Download Android test APK, internet required" title="Android test build · Internet required">
                <Download className="h-4 w-4" aria-hidden="true" />
                Test APK
              </Link>}
              <Link href="/settings" aria-label="Profile and settings" className="shrink-0 rounded-full transition-transform active:scale-95">
                <ChatAvatar avatarId={account?.avatarId ?? null} avatarUrl={account?.avatarUrl ?? null} name={account?.username ?? "you"} size={40} />
              </Link>
            </div>
          </div>
          <PeopleSearch onPick={(username) => void startChat(username)} onQueryChange={setSearch} searchRemote={REMOTE} />
        </header>

        <div className="flex-1 pb-28">
          {!sheetOpen && startError && <p role="alert" className="mb-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{startError}</p>}
          {REMOTE && inboxError && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-100"><span>Couldn’t refresh your chats. Your existing messages may still be on the server.</span><button type="button" className="underline" onClick={() => { void listConversations().then((rows) => { setRemoteChats(rows); setInboxError(false); }).catch(() => setInboxError(true)); }}>Retry</button></div>}
          {REMOTE && !remoteChats ? (
            !inboxError && <p className="py-8 text-center text-sm text-zinc-500">Loading chats…</p>
          ) : rows.length === 0 && !search.trim() ? (
            <HomeEmptyState />
          ) : filteredRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No matching conversations.</p>
          ) : (
            <div className="flex flex-col">
              {filteredRows.map((chat, i) => (
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
                {doremonRecords.map((rec) => {
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
                          {rec.memory.summary || rec.memory.finalSummary || "No summary yet"}
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

      <button type="button" onClick={openStart} aria-label="Start a conversation" className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF5C7A] text-white shadow-lg shadow-rose-500/20 transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
        <Plus className="h-6 w-6" strokeWidth={2} />
      </button>

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
