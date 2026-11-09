"use client";

import Link from "next/link";
import { DialogPortal } from "@/components/ui/dialog-portal";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, MoreHorizontal, Phone, Video } from "lucide-react";
import { ChatAvatar } from "@/components/home/chat-row";

/**
 * A compact, blurred header: the name and one honest line about where the other person is.
 * The wallpaper stays visible through the glass; secondary actions live behind the menu.
 */
export function ChatHeader({
  name,
  avatarId,
  avatarUrl,
  online,
  status,
  typing,
  hidden,
  onMenu,
  onCall,
  onBack,
}: {
  name: string;
  avatarId: string | null;
  avatarUrl?: string | null;
  online: boolean;
  /** e.g. "last seen 2m ago" */
  status: string;
  typing: boolean;
  /** presence is turned off — say so instead of lying */
  hidden?: boolean;
  onMenu: () => void;
  /** live calls only — hidden in the local demo */
  onCall?: (type: "voice" | "video") => void;
  /**
   * The swipe-back wrapper's animated dismissal. Passed by the chat screen so
   * the arrow plays the same "screen slides away" transition instead of
   * navigating instantly.
   */
  onBack?: () => void;
}) {
  const line = typing ? "typing…" : hidden ? "presence off" : status;
  const backClass =
    "-ml-1 flex h-10 w-10 shrink-0 items-center justify-center text-white transition-colors hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

  return (
    <header className="sticky top-0 z-30 shrink-0 bg-black/40 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] w-full max-w-2xl items-center gap-1 px-2">
        {onBack ? (
          <button type="button" onClick={onBack} aria-label="Back to chats" className={backClass}>
            <ArrowLeft className="h-6 w-6" strokeWidth={1.8} />
          </button>
        ) : (
          <Link href="/app" aria-label="Back to chats" className={backClass}>
            <ArrowLeft className="h-6 w-6" strokeWidth={1.8} />
          </Link>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative h-8 w-8 shrink-0">
            <ChatAvatar avatarId={avatarId} avatarUrl={avatarUrl} name={name} size={32} />
            {online && !hidden && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-black bg-green-500" aria-label="Online" />}
          </div>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[15px] font-semibold text-white">{name}</h1>
            <p
              aria-live="polite"
              className="truncate text-[12px] text-zinc-400"
            >
              {line}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-4">
          {onCall && (
            <button
              type="button"
              onClick={() => onCall("voice")}
              aria-label="Voice call"
              className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <Phone className="h-5 w-5" strokeWidth={1.8} />
            </button>
          )}
          {onCall && (
            <button
              type="button"
              onClick={() => onCall("video")}
              aria-label="Video call"
              className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <Video className="h-5 w-5" strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            onClick={onMenu}
            aria-label="Chat options"
            className="flex h-10 w-10 shrink-0 items-center justify-center text-zinc-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </header>
  );
}

export type ChatMenuAction = {
  key: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
  active?: boolean;
};

/** Bottom sheet behind the "…": calls, room, mute, clear, block. */
export function ChatMenuSheet({
  open,
  name,
  actions,
  onClose,
}: {
  open: boolean;
  name: string;
  actions: ChatMenuAction[];
  onClose: () => void;
}) {
  return (
    <DialogPortal><AnimatePresence>
      {open && (
        <div data-swipe-back="ignore" className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${name} chat options`}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="relative max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[24px] border border-white/[0.07] bg-[#111113] pb-6 sm:mb-0 sm:rounded-[22px]"
          >
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
            <p className="px-5 pb-2 pt-4 text-[11px] uppercase tracking-[0.16em] text-zinc-600">
              {name}
            </p>
            <div className="px-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    onClose();
                    action.onSelect();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14.5px] transition-colors hover:bg-white/[0.05] ${
                    action.danger ? "text-[#FF6B6B]" : "text-zinc-200"
                  }`}
                >
                  <span className={action.danger ? "text-[#FF6B6B]/80" : "text-zinc-500"}>
                    {action.icon}
                  </span>
                  <span className="flex-1">{action.label}</span>
                  {action.hint && <span className="text-[11.5px] text-zinc-600">{action.hint}</span>}
                  {action.active !== undefined && (
                    <span
                      className={`h-5 w-9 rounded-full p-0.5 transition-colors ${
                        action.active ? "bg-rose" : "bg-white/12"
                      }`}
                      aria-hidden
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                          action.active ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mx-2 mt-2 w-[calc(100%-16px)] rounded-xl bg-white/[0.05] py-3 text-[14px] font-medium text-zinc-200"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence></DialogPortal>
  );
}
