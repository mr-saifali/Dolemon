"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUp, ChevronLeft, Lock, Sparkles } from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { Avatar } from "@/components/avatar";
import { demoConversations } from "@/lib/chat";

function ThreadScreen() {
  const params = useParams<{ id: string }>();
  const conversation = demoConversations().find((c) => c.id === params.id);

  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-ink">
      <header className="relative z-10 mx-auto flex w-full max-w-md items-center gap-2 px-4 pb-3 pt-5 safe-t">
        <Link
          href="/app"
          aria-label="Back to chats"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar
            avatarId={conversation?.avatarId ?? null}
            name={conversation?.name ?? "Chat"}
            size="sm"
            online={conversation?.online}
          />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-medium">{conversation?.name ?? "Chat"}</p>
            <p className="truncate text-[11.5px] text-text-muted">
              {conversation?.typing
                ? "typing…"
                : conversation?.online
                  ? "Online"
                  : "Last seen recently"}
            </p>
          </div>
        </div>

        <span className="flex items-center gap-1 rounded-full border border-ink-line bg-ink-surface/70 px-2.5 py-1 text-[10.5px] text-text-muted">
          <Lock className="h-2.5 w-2.5" />
          Private
        </span>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-6">
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose/20 bg-rose/10 text-rose shadow-glow">
            <Sparkles className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <h1 className="text-[19px] font-semibold tracking-[-0.01em]">
            {conversation ? `You and ${conversation.name}` : "This chat"}
          </h1>
          <p className="mt-2 max-w-[18rem] text-[13.5px] leading-relaxed text-text-muted">
            Your messages will live here — just the two of you, nothing else. The threaded
            conversation UI is the next piece to build.
          </p>
        </div>

        <div className="pb-6">
          <div className="flex items-end gap-2 rounded-[24px] border border-ink-line bg-ink-surface/80 p-1.5 pl-4">
            <input
              disabled
              placeholder="Message"
              className="h-10 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-muted/70"
            />
            <button
              type="button"
              disabled
              aria-label="Send message"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose/25 text-rose/60"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-3 text-center text-[11px] text-text-muted/60">
            Messages are only ever between you two.
          </p>
        </div>
      </div>
    </main>
  );
}

export default function ThreadPage() {
  return (
    <AppGuard>
      <ThreadScreen />
    </AppGuard>
  );
}
