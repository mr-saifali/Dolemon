"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { ChatAvatar, ChatRow, type ChatRowData } from "@/components/home/chat-row";
import { HomeEmptyState } from "@/components/home/empty-state";
import { PeopleSearch } from "@/components/home/people-search";
import { StartChatSheet } from "@/components/home/start-chat-sheet";
import { authMode } from "@/lib/auth";
import { demoConversations, greetingFor } from "@/lib/chat";
import { useChatMeta } from "@/lib/conversation-meta";
import { listConversations, openDirectConversation, type DbConversation } from "@/lib/db";
import { useSession } from "@/lib/session";
import { lastMessageOf, previewFor, threadExists, unreadSince } from "@/lib/thread";
import type { ChatMessage } from "@/lib/thread";

const REMOTE = authMode === "supabase";

function HomeScreen() {
  const router = useRouter();
  const { account } = useSession();
  const metaMap = useChatMeta();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [remoteChats, setRemoteChats] = useState<DbConversation[] | null>(null);

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

  const rows = useMemo<ChatRowData[]>(() => {
    if (REMOTE) {
      return (remoteChats ?? []).map((c) => ({
        id: c.id,
        name: c.partnerUsername,
        handle: c.partnerUsername,
        avatarId: c.partnerAvatar,
        avatarUrl: c.partnerAvatarUrl,
        preview: previewOf(c),
        at: c.lastAt,
        unread: c.unread,
      }));
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
        };
      })
      .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  }, [remoteChats, metaMap]);

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
              {greetingFor()},{" "}
              <span className="text-brand font-normal">@{account?.username ?? "you"}</span>
            </motion.h1>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
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
        </div>
      </div>

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
