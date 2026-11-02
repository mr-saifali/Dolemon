"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Copy, CornerUpLeft, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessage } from "@/lib/thread";
import { EMOJI_ROW } from "./message-bubble";

const EASE = [0.22, 1, 0.36, 1] as const;

export function MessageActions({
  message,
  onClose,
  onReply,
  onReact,
  onDelete,
}: {
  message: ChatMessage | null;
  onClose: () => void;
  onReply: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onDelete: (message: ChatMessage) => void;
}) {
  const copy = async () => {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.text || "attachment");
      toast.success("Copied");
      onClose();
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <AnimatePresence>
      {message && (
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
            aria-label="Message actions"
            initial={{ y: "100%", opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.7 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#14141A] px-4 pb-7 pt-3 shadow-card sm:rounded-[26px]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[11.5px] uppercase tracking-[0.14em] text-text-muted/70">React</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between gap-1 rounded-full border border-ink-line bg-ink-surface/70 p-1.5">
              {EMOJI_ROW.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(message, emoji);
                    onClose();
                  }}
                  className="flex h-10 flex-1 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-white/[0.05] active:scale-95"
                  aria-label={`React ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl2 border border-ink-line">
              <ActionRow icon={<CornerUpLeft className="h-4 w-4" />} label="Reply" onClick={() => { onReply(message); onClose(); }} />
              <ActionRow icon={<Copy className="h-4 w-4" />} label="Copy text" onClick={copy} border />
              <ActionRow
                icon={<Trash2 className="h-4 w-4" />}
                label="Delete for me"
                danger
                border
                onClick={() => {
                  onDelete(message);
                  toast.success("Message deleted");
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

function ActionRow({
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
