"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Moon, Plus } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { ChatRow, type ChatRowData } from "@/components/home/chat-row";
import { StartChatSheet } from "@/components/home/start-chat-sheet";
import { authMode } from "@/lib/auth";
import { demoConversations, greetingFor } from "@/lib/chat";
import { useChatMeta } from "@/lib/conversation-meta";
import { listConversations, openDirectConversation, type DbConversation } from "@/lib/db";
import { useSession } from "@/lib/session";

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
        preview: previewOf(c),
        at: c.lastAt,
        unread: c.unread,
      }));
    }

    return demoConversations()
      .filter((c) => !metaMap[c.id]?.deleted)
      .map((c) => ({
        id: c.id,
        name: c.name,
        handle: c.username,
        avatarId: c.avatarId,
        preview: c.lastMessage,
        at: c.lastAt,
        unread: metaMap[c.id]?.unread ?? c.unread,
        typing: metaMap[c.id]?.muted ? false : c.typing,
      }))
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

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#09090B]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-40 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.18),rgba(255,140,90,0.07)_45%,transparent_72%)] blur-3xl"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 safe-t">
        <header className="flex items-start justify-between gap-2 pb-4 pt-9">
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="text-[30px] font-light leading-tight tracking-[-0.02em] text-zinc-100"
          >
            {greetingFor()},{" "}
            <span className="font-normal text-zinc-100">
              @{account?.username ?? "you"}
            </span>
          </motion.h1>

          <div className="mt-1 flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => {
                setStartError(null);
                setSheetOpen(true);
              }}
              aria-label="Start a conversation"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              <Plus className="h-[19px] w-[19px]" strokeWidth={1.8} />
            </button>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            >
              <Moon className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </Link>
          </div>
        </header>

        <div className="flex-1 pb-10">
          {rows.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="mt-24 text-center"
            >
              <p className="text-[15px] text-zinc-400">No one here yet.</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">
                {REMOTE
                  ? "Tap + and type a friend's handle to open a room."
                  : "Demo mode — tap + to open a sample chat."}
              </p>
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="mt-5 rounded-full bg-white/5 px-4 py-2 text-[13px] text-zinc-300 transition-colors hover:bg-white/[0.08]"
              >
                Start a conversation
              </button>
            </motion.div>
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
  if (!c.lastBody) return "Say something. No one else is reading.";
  if (c.lastKind === "sticker") return "Sent a reaction";
  return c.lastBody;
}

export default function HomePage() {
  return (
    <AppGuard>
      <HomeScreen />
    </AppGuard>
  );
}
