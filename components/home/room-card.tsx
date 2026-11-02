"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Lamp } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { authMode } from "@/lib/auth";
import { formatAgo, formatDuration, usePresence } from "@/lib/presence";
import { usePrefs } from "@/lib/prefs";
import type { Conversation } from "@/lib/chat";

/**
 * The room, surfaced on the home screen: a live strip that says whether you're both in.
 * This is the piece that makes Dolemon feel like a place rather than an inbox.
 */
export function RoomCard({ conversation }: { conversation: Conversation }) {
  const prefs = usePrefs();
  const { together, togetherSince, lastSeenAt } = usePresence({ demo: authMode === "local" });

  const status = together
    ? `Both here${togetherSince ? ` · ${formatDuration(Date.now() - togetherSince)}` : ""}`
    : lastSeenAt
      ? `${conversation.name} left ${formatAgo(lastSeenAt)}`
      : `${conversation.name} is away`;

  return (
    <Link
      href={`/app/room/${conversation.id}`}
      className="group relative mb-4 block overflow-hidden rounded-[20px] border border-white/[0.07] bg-gradient-to-br from-rose/[0.13] via-white/[0.03] to-transparent p-4 transition-colors hover:border-rose/25"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.35),transparent_68%)] blur-xl"
        animate={{ opacity: together ? 1 : 0.2 }}
        transition={{ duration: 0.9 }}
      />

      <div className="relative flex items-center gap-3">
        <div className="flex items-center">
          <Avatar avatarId={conversation.avatarId} name={conversation.name} size="sm" online={together} />
          <span
            className="-ml-3 flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#1A1418] bg-ink-surface text-[11px] font-semibold text-rose/80"
            aria-hidden
          >
            You
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13.5px] font-medium">
            Your room
            {prefs.lampOn && (
              <span className="flex items-center gap-1 rounded-full bg-rose/10 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-rose/80">
                <Lamp className="h-2.5 w-2.5" />
                lit
              </span>
            )}
          </p>
          <p
            className={
              together
                ? "mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-success"
                : "mt-0.5 truncate text-[11.5px] text-text-muted"
            }
          >
            {together && (
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
            )}
            {status}
          </p>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
