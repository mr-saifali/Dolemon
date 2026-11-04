"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";
import { avatarById, AVATAR_PRESETS } from "@/lib/avatars";
import { initialsFor } from "@/lib/chat";
import { TypingDots } from "@/components/ui/typing-dots";
import { formatChatTime } from "@/lib/chat";

export type ChatRowData = {
  id: string;
  name: string;
  handle: string;
  avatarId: string | null;
  avatarUrl?: string | null;
  preview: string;
  at: number | null;
  unread: number;
  typing?: boolean;
  /** the last line is yours → the tick ladder sits next to the time, like Telegram */
  lastMine?: boolean;
  lastStatus?: "sending" | "sent" | "delivered" | "read" | "failed" | null;
};

/** The tick ladder at list scale: one tick = delivered, two (accent) = seen. */
function HomeTicks({ status }: { status: NonNullable<ChatRowData["lastStatus"]> }) {
  if (status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-red-400" aria-label="Not sent" />;
  if (status === "sending") return <Clock className="h-3.5 w-3.5 text-zinc-500" aria-label="Sending" />;
  if (status === "read") return <CheckCheck className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} aria-label="Seen" />;
  return <Check className="h-3.5 w-3.5 text-zinc-400" aria-label="Delivered" />;
}

/** A 56px gradient avatar — no card, no border, just the person. */
export function ChatAvatar({
  avatarId,
  avatarUrl,
  name,
  size = 56,
  online,
}: {
  avatarId: string | null;
  avatarUrl?: string | null;
  name: string;
  size?: number;
  online?: boolean;
}) {
  const preset = avatarById(avatarId);
  const ring = preset?.ring ?? "#FF5C7A";
  const fallback = AVATAR_PRESETS[0];

  return (
    <div className="relative shrink-0">
      <div
        className="rounded-[19px] p-[1.5px]"
        style={{
          background: `linear-gradient(140deg, ${hexA(ring, 0.75)} 0%, ${hexA("#A78BFA", 0.45)} 55%, ${hexA("#7DD3FC", 0.55)} 100%)`,
        }}
      >
      <div
        className="flex items-center justify-center overflow-hidden rounded-[17px]"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(120% 120% at 20% 0%, ${hexA(ring, 0.32)} 0%, ${hexA(ring, 0.1)} 55%, rgba(24,24,27,1) 100%)`,
          boxShadow: `inset 0 0 0 1px ${hexA(ring, 0.16)}`,
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span style={{ fontSize: size * 0.42 }} aria-hidden>
            {preset?.emoji ?? fallback.emoji}
          </span>
        )}
        {!preset && !avatarUrl && (
          <span className="absolute text-[13px] font-semibold tracking-wide text-rose/90">
            {initialsFor(name)}
          </span>
        )}
      </div>
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#09090B] bg-mint shadow-[0_0_10px_rgba(94,234,212,0.85)]" />
      )}
    </div>
  );
}

function hexA(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function ChatRow({ chat, index }: { chat: ChatRowData; index: number }) {
  const unreadLabel = chat.unread > 9 ? "9+" : String(chat.unread);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.04 * Math.min(index, 8) }}
    >
      <Link
        href={`/app/chat/${chat.id}`}
        className="press flex items-center gap-3.5 rounded-2xl px-1 py-3 active:bg-white/[0.04]"
      >
        <ChatAvatar
            avatarId={chat.avatarId}
            avatarUrl={chat.avatarUrl}
            name={chat.name}
            online={Boolean(chat.typing)}
          />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-[15.5px] font-medium tracking-[-0.01em] text-zinc-100">
              {chat.handle ? `@${chat.handle}` : chat.name}
            </p>
            {chat.at && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-zinc-500">
                {chat.lastMine && chat.lastStatus ? <HomeTicks status={chat.lastStatus} /> : null}
                {formatChatTime(chat.at)}
              </span>
            )}
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-3">
            {chat.typing ? (
              <span className="flex items-center gap-1.5 text-[13px] text-[#FF9E7A]">
                <TypingDots /> typing
              </span>
            ) : (
              <p className="truncate text-[13.5px] text-zinc-400">{chat.preview}</p>
            )}
            {chat.unread > 0 && (
              <span
                className="flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold text-white shadow-[0_4px_14px_-4px_var(--glow-send)]"
                style={{ background: "var(--brand-grad)" }}
              >
                {unreadLabel}
              </span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
