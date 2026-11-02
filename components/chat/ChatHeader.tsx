"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/avatar";

/**
 * 56px, blurred, and quiet: the name and one honest line about where the other person is.
 * Everything else lives behind the single "…" so the room keeps its air.
 */
export function ChatHeader({
  name,
  avatarId,
  online,
  status,
  typing,
  hidden,
  onMenu,
}: {
  name: string;
  avatarId: string | null;
  online: boolean;
  /** e.g. "last seen 2m ago" */
  status: string;
  typing: boolean;
  /** presence is turned off — say so instead of lying */
  hidden?: boolean;
  onMenu: () => void;
}) {
  const line = typing ? "typing…" : hidden ? "presence off" : status;

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-[#0E0E11]/72 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1.5 px-2">
        <Link
          href="/app"
          aria-label="Back to chats"
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8E8E93] transition-colors hover:bg-white/[0.05] hover:text-text"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Avatar avatarId={avatarId} name={name} size="xs" online={online} />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[16px] font-semibold tracking-[-0.01em] text-text">{name}</h1>
            <p
              aria-live="polite"
              className={
                typing
                  ? "truncate text-[12px] text-rose/90"
                  : online
                    ? "truncate text-[12px] text-[#8E8E93]"
                    : "truncate text-[12px] text-[#8E8E93]"
              }
            >
              {line}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onMenu}
          aria-label="Chat options"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#8E8E93] transition-colors hover:bg-white/[0.05] hover:text-text"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
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
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${name} chat options`}
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="relative w-full max-w-md overflow-hidden rounded-t-[24px] border border-white/[0.07] bg-[#16161B] pb-6 shadow-card sm:mb-0 sm:rounded-[22px]"
          >
            <div className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
            <p className="px-5 pb-2 pt-4 text-[11px] uppercase tracking-[0.16em] text-[#8E8E93]/70">
              {name}
            </p>
            <div className="px-2">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => {
                    action.onSelect();
                    onClose();
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-[14.5px] transition-colors hover:bg-white/[0.05] ${
                    action.danger ? "text-danger" : "text-text"
                  }`}
                >
                  <span className={action.danger ? "text-danger/80" : "text-[#8E8E93]"}>
                    {action.icon}
                  </span>
                  <span className="flex-1">{action.label}</span>
                  {action.hint && <span className="text-[11.5px] text-[#8E8E93]">{action.hint}</span>}
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
              className="mx-2 mt-2 w-[calc(100%-16px)] rounded-xl bg-white/[0.05] py-3 text-[14px] font-medium text-text"
            >
              Cancel
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
