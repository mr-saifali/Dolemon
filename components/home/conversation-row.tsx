"use client";

import Link from "next/link";
import { BellOff, Pin } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { formatChatTime } from "@/lib/chat";
import type { Conversation } from "@/lib/chat";
import { cn } from "@/lib/utils";

export function ConversationRow({ conversation }: { conversation: Conversation }) {
  const { unread, typing, muted, outgoing, pinned } = conversation;
  const unreadLabel = unread > 9 ? "9+" : String(unread);

  return (
    <Link
      href={`/app/chat/${conversation.id}`}
      className="group relative flex items-center gap-3 rounded-2xl px-2.5 py-3 transition-colors duration-150 hover:bg-white/[0.035] active:bg-white/[0.06]"
    >
      <Avatar
        avatarId={conversation.avatarId}
        name={conversation.name}
        online={conversation.online}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p
            className={cn(
              "truncate text-[15px] leading-tight",
              unread > 0 ? "font-semibold text-text" : "font-medium text-text/90"
            )}
          >
            {conversation.name}
          </p>
          {pinned && (
            <Pin className="h-3 w-3 shrink-0 rotate-45 text-text-muted/60" aria-label="Pinned" />
          )}
          {muted && (
            <BellOff className="h-3 w-3 shrink-0 text-text-muted/60" aria-label="Muted" />
          )}
          <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-text-muted/80">
            {formatChatTime(conversation.lastAt)}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <p
            className={cn(
              "truncate text-[13px] leading-tight",
              typing
                ? "font-medium italic text-rose/90"
                : "text-text-muted",
              unread > 0 && !typing && "text-text/70"
            )}
          >
            {typing ? (
              "typing…"
            ) : (
              <>
                {outgoing && <span className="text-text-muted/60">You: </span>}
                {conversation.lastMessage}
              </>
            )}
          </p>

          {unread > 0 && (
            <span className="ml-auto flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-rose px-1.5 text-[11px] font-semibold leading-none text-[#1A0A0F]">
              {unreadLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
