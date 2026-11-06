"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { avatarById } from "@/lib/avatars";
import { initialsFor, formatChatTime } from "@/lib/chat";
import { TypingDots } from "@/components/ui/typing-dots";

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
};

/** A flat, circular avatar; uploaded photos, preset emoji and initials all share the same shape. */
export function ChatAvatar({ avatarId, avatarUrl, name, size = 48, online }: {
  avatarId: string | null; avatarUrl?: string | null; name: string; size?: number; online?: boolean;
}) {
  const preset = avatarById(avatarId);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full" style={{ background: preset?.bg ?? "rgba(255,255,255,0.05)" }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : preset ? (
          <span aria-hidden style={{ fontSize: size * 0.48, lineHeight: 1 }}>{preset.emoji}</span>
        ) : (
          <span aria-hidden className="font-medium text-zinc-300" style={{ fontSize: size * 0.32 }}>{initialsFor(name)}</span>
        )}
      </div>
      {online && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#09090B] bg-emerald-400" aria-label="Online" />}
    </div>
  );
}

export function ChatRow({ chat }: { chat: ChatRowData; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}>
      <Link href={`/app/chat/${chat.id}`} className="press flex items-center gap-3.5 rounded-2xl px-1 py-3 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]">
        <ChatAvatar avatarId={chat.avatarId} avatarUrl={chat.avatarUrl} name={chat.name} online={Boolean(chat.typing)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className={`min-w-0 truncate text-[15px] text-zinc-100 ${chat.unread > 0 ? "font-bold" : "font-medium"}`}>
              {chat.handle ? `@${chat.handle}` : chat.name}
            </p>
            {chat.at != null && <time dateTime={new Date(chat.at).toISOString()} className={`shrink-0 text-xs tabular-nums ${chat.unread > 0 ? "text-[#FF5C7A]" : "text-zinc-500"}`}>{formatChatTime(chat.at)}</time>}
          </div>
          <div className="mt-1 flex items-center gap-3">
            {chat.typing ? <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-[#FF8FA3]"><TypingDots /> typing</span> : <p className="min-w-0 flex-1 truncate text-[14px] text-zinc-400">{chat.preview}</p>}
            {chat.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-[#FF5C7A]" aria-label={`${chat.unread} unread ${chat.unread === 1 ? "message" : "messages"}`} />}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
