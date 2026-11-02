"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, Search, SquarePen, X } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { BrandBlob } from "@/components/brand-blob";
import { Avatar } from "@/components/avatar";
import { ConversationRow } from "@/components/home/conversation-row";
import { NewChatSheet } from "@/components/home/new-chat-sheet";
import { Button } from "@/components/ui/button";
import { authMode } from "@/lib/auth";
import { demoConversations, greetingFor, type Conversation } from "@/lib/chat";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

const EASE = [0.22, 1, 0.36, 1] as const;

function HomeScreen() {
  const { account } = useSession();
  const [conversations] = useState<Conversation[]>(() => demoConversations());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetOpen, setSheetOpen] = useState(false);

  const unreadCount = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unread, 0),
    [conversations]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations
      .filter((c) => (filter === "unread" ? c.unread > 0 : true))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.username.toLowerCase().includes(q) ||
          c.lastMessage.toLowerCase().includes(q)
      )
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.lastAt - a.lastAt);
  }, [conversations, filter, query]);

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink">
      <BrandBlob className="absolute inset-0" />

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6 safe-t">
        {/* Greeting + account */}
        <header className="flex items-start justify-between pb-6 pt-7">
          <div>
            <p className="text-[13px] font-medium text-text-muted">
              {greetingFor()}
              {account?.username ? "," : ""}
            </p>
            <h1 className="mt-0.5 flex items-center gap-2 text-[28px] font-semibold leading-tight tracking-[-0.025em]">
              {account?.username ? `@${account.username}` : "Chats"}
              {account?.hasAppLock && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-line bg-ink-surface text-text-muted">
                  <Lock className="h-3 w-3" aria-label="App password on" />
                </span>
              )}
            </h1>
            <p className="mt-1.5 text-[12.5px] text-text-muted/80">
              {unreadCount > 0
                ? `${unreadCount} new message${unreadCount === 1 ? "" : "s"} waiting`
                : "All caught up"}
            </p>
          </div>

          <Link
            href="/settings"
            aria-label="Open settings"
            className="mt-1 rounded-2xl ring-2 ring-transparent transition-all hover:ring-white/10 active:scale-95"
          >
            <Avatar avatarId={account?.avatarId ?? null} name={account?.username ?? "You"} size="md" />
          </Link>
        </header>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your people"
            aria-label="Search conversations"
            className="h-12 w-full rounded-full border border-ink-line bg-ink-surface/80 pl-11 pr-11 text-[14.5px] text-text placeholder:text-text-muted/70 transition-colors hover:border-[#3A3A45] focus:border-rose/60 focus:ring-4 focus:ring-rose/10"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.07] text-text-muted hover:text-text"
              >
                <X className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-2">
          {(
            [
              { id: "all", label: "All", count: conversations.length },
              { id: "unread", label: "Unread", count: unreadCount },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={active}
                className={cn(
                  "relative flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-rose/30 bg-rose/12 text-text"
                    : "border-ink-line bg-transparent text-text-muted hover:text-text"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "tabular-nums text-[11px]",
                    active ? "text-rose" : "text-text-muted/70"
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}

          <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted/60">
            <Lock className="h-3 w-3" />
            Just you two
          </span>
        </div>

        {/* List */}
        <div className="mt-3 flex-1 pb-28">
          {visible.length > 0 ? (
            <motion.ul
              initial="hidden"
              animate="show"
              variants={{ show: { transition: { staggerChildren: 0.035 } } }}
              className="-mx-1 space-y-0.5"
            >
              {visible.map((conversation) => (
                <motion.li
                  key={conversation.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
                  }}
                >
                  <ConversationRow conversation={conversation} />
                </motion.li>
              ))}
            </motion.ul>
          ) : (
            <EmptyState
              searching={Boolean(query)}
              onInvite={() => setSheetOpen(true)}
              onClear={() => {
                setQuery("");
                setFilter("all");
              }}
            />
          )}

          {authMode === "local" && visible.length > 0 && (
            <p className="mt-6 px-2 text-center text-[11px] leading-relaxed text-text-muted/50">
              Sample conversations, stored on this device. Real chats appear here once
              you&apos;re connected.
            </p>
          )}
        </div>
      </div>

      {/* New chat */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20">
        <div className="mx-auto flex max-w-md justify-end px-6 pb-6 safe-b">
          <motion.button
            type="button"
            onClick={() => setSheetOpen(true)}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 320, damping: 22 }}
            whileTap={{ scale: 0.94 }}
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose text-[#1A0A0F] shadow-[0_14px_36px_-10px_rgba(255,92,122,0.85)] transition-colors hover:bg-rose-soft"
            aria-label="Start a new chat"
          >
            <SquarePen className="h-5 w-5" strokeWidth={2.2} />
          </motion.button>
        </div>
      </div>

      <NewChatSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        username={account?.username}
      />
    </main>
  );
}

function EmptyState({
  searching,
  onInvite,
  onClear,
}: {
  searching: boolean;
  onInvite: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex flex-col items-center px-2 py-14 text-center"
    >
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] border border-white/[0.07] bg-white/[0.04] text-2xl">
        {searching ? "🔍" : "💌"}
      </div>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em]">
        {searching ? "Nothing matches" : "It's quiet in here"}
      </h2>
      <p className="mt-2 max-w-[17rem] text-[13.5px] leading-relaxed text-text-muted">
        {searching
          ? "No chats match that search. Try a different name or clear it."
          : "Invite the one person who matters. Your first chat starts with a single link."}
      </p>

      <div className="mt-6 w-full max-w-[16rem] space-y-2.5">
        {searching ? (
          <Button size="default" className="w-full" onClick={onClear}>
            Clear search
          </Button>
        ) : (
          <>
            <Button size="default" className="w-full" onClick={onInvite}>
              Invite your person
            </Button>
            <p className="text-[11.5px] text-text-muted/60">One link, one person. Always.</p>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  return (
    <AppGuard>
      <HomeScreen />
    </AppGuard>
  );
}
