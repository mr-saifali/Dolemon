"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellOff, BellRing, CheckCheck, Pin, PinOff, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Conversation } from "@/lib/chat";
import type { ChatMeta } from "@/lib/conversation-meta";
import { markRead, patchMeta } from "@/lib/conversation-meta";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ChatActions({
  conversation,
  meta,
  onClose,
}: {
  conversation: Conversation | null;
  meta: ChatMeta | undefined;
  onClose: () => void;
}) {
  const pinned = meta?.pinned ?? conversation?.pinned;
  const muted = meta?.muted ?? conversation?.muted;

  return (
    <AnimatePresence>
      {conversation && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${conversation.name} actions`}
            initial={{ y: "100%", opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.7 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#14141A] px-4 pb-7 pt-3 shadow-card sm:rounded-[26px]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <div className="mb-3 flex items-center justify-between px-1">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{conversation.name}</p>
                <p className="truncate text-[11.5px] text-text-muted">@{conversation.username}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-hidden rounded-xl2 border border-ink-line">
              <Row
                icon={pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                label={pinned ? "Unpin chat" : "Pin to top"}
                onClick={() => {
                  patchMeta(conversation.id, { pinned: !pinned });
                  toast.success(pinned ? "Unpinned" : "Pinned to top");
                  onClose();
                }}
              />
              <Row
                border
                icon={muted ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                label={muted ? "Unmute notifications" : "Mute notifications"}
                onClick={() => {
                  patchMeta(conversation.id, { muted: !muted });
                  toast.success(muted ? "Notifications on" : "Muted");
                  onClose();
                }}
              />
              <Row
                border
                icon={<CheckCheck className="h-4 w-4" />}
                label="Mark as read"
                onClick={() => {
                  markRead(conversation.id);
                  toast.success("Marked as read");
                  onClose();
                }}
              />
              <Row
                border
                danger
                icon={<Trash2 className="h-4 w-4" />}
                label="Delete chat"
                onClick={() => {
                  patchMeta(conversation.id, { deleted: true });
                  if (typeof window !== "undefined") {
                    window.localStorage.removeItem(`dolemon:thread:${conversation.id}`);
                  }
                  toast.success("Chat deleted");
                  onClose();
                }}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Row({
  icon,
  label,
  onClick,
  danger,
  border,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  border?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] transition-colors hover:bg-white/[0.04] ${
        danger ? "text-danger" : "text-text"
      } ${border ? "border-t border-ink-line" : ""}`}
    >
      <span className={danger ? "text-danger/80" : "text-text-muted"}>{icon}</span>
      {label}
    </button>
  );
}
