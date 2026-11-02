"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Link2, Lock, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const EASE = [0.22, 1, 0.36, 1] as const;

export function NewChatSheet({
  open,
  onClose,
  username,
}: {
  open: boolean;
  onClose: () => void;
  username?: string | null;
}) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLink(`${window.location.origin}/u/${username}`);
  }, [username]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Come find me on Dolemon — it's just us. ${link}`);
      setCopied(true);
      toast.success("Invite link copied");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually.");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-chat-title"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="relative w-full max-w-md rounded-t-[28px] border border-white/[0.07] bg-[#14141A] px-6 pb-8 pt-3 shadow-card sm:mb-0 sm:rounded-[28px]"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <div className="flex items-start justify-between">
              <div>
                <h2 id="new-chat-title" className="text-[20px] font-semibold tracking-[-0.01em]">
                  Start a chat
                </h2>
                <p className="mt-1.5 max-w-[17rem] text-[13px] leading-relaxed text-text-muted">
                  Send your link to one person. They tap it, join, and you&apos;re connected.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-2 -mt-1 flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-xl2 border border-ink-line bg-ink-surface p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-[11.5px] uppercase tracking-[0.14em] text-text-muted/70">
                <Link2 className="h-3 w-3" />
                Your invite link
              </p>
              <p className="truncate text-[13.5px] text-text/90">
                {link ? link.replace(/^https?:\/\//, "") : "Set a username first"}
              </p>
              <Button size="sm" className="mt-3 w-full" onClick={copy} disabled={!link}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy invite link"}
              </Button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-text-muted/70">
              <Lock className="h-3 w-3" />
              One link, one person. No groups, no discovery.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SheetSearchHint() {
  return (
    <div className="flex items-center gap-2 rounded-field border border-ink-line bg-ink-surface/60 px-3 py-2.5 text-[13px] text-text-muted/70">
      <Search className="h-3.5 w-3.5" />
      Search people by @handle
      <span className="ml-auto rounded-full border border-ink-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
        Soon
      </span>
    </div>
  );
}
