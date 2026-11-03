"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, AtSign, Loader2, X } from "lucide-react";
import { ChatAvatar } from "./chat-row";

export type StartChatPerson = { id: string; handle: string; avatarId: string | null };

export function StartChatSheet({
  open,
  onClose,
  onStart,
  demoPeople,
  onPickDemo,
  starting,
  error,
  myHandle,
}: {
  open: boolean;
  onClose: () => void;
  /** real mode: open a thread by handle */
  onStart?: (handle: string) => void;
  /** demo mode: pick one of the sample people */
  demoPeople?: StartChatPerson[];
  onPickDemo?: (id: string) => void;
  starting?: boolean;
  error?: string | null;
  /** shown in real mode so the other person can be found */
  myHandle?: string | null;
}) {
  const [handle, setHandle] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setHandle("");
      setCopied(false);
    }
  }, [open]);

  const share = async () => {
    if (!myHandle) return;
    try {
      await navigator.clipboard.writeText(`@${myHandle}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the handle is on screen anyway */
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
            onClick={onClose}
            className="absolute inset-0 bg-black/65"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Start a chat"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#111113] px-5 pb-[max(env(safe-area-inset-bottom),22px)] pt-3 sm:rounded-[26px]"
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/15 sm:hidden" />

            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-medium tracking-[-0.01em] text-zinc-100">
                Start a conversation
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {demoPeople ? (
              <>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                  Demo mode — these are sample people. Sign in with Supabase to talk to someone real.
                </p>
                <div className="mt-4 space-y-1">
                  {demoPeople.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onPickDemo?.(person.id);
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-white/[0.03]"
                    >
                      <ChatAvatar avatarId={person.avatarId} name={person.handle} size={40} />
                      <span className="text-[15px] text-zinc-200">@{person.handle}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
                  Type their handle. If they&apos;re on Dolemon, the room opens.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (handle.trim()) onStart?.(handle.trim());
                  }}
                  className="mt-4 flex items-center gap-2"
                >
                  <div className="flex h-12 flex-1 items-center gap-2 rounded-full bg-[#1C1C1E] px-4">
                    <AtSign className="h-4 w-4 shrink-0 text-zinc-500" />
                    <input
                      autoFocus
                      value={handle}
                      onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").toLowerCase())}
                      placeholder="their handle"
                      aria-label="Friend's handle"
                      className="h-full w-full bg-transparent text-[15px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!handle.trim() || starting}
                    aria-label="Open chat"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
                    style={{ background: "var(--accent)" }}
                  >
                    {starting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4" />
                    )}
                  </button>
                </form>

                {error && <p className="mt-3 text-[12.5px] text-[#FF6B6B]">{error}</p>}

                {myHandle && (
                  <button
                    type="button"
                    onClick={() => void share()}
                    className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3 text-left transition-colors active:bg-white/[0.07]"
                  >
                    <span className="text-[12px] text-zinc-500">
                      {copied ? "Copied — send it to them" : "Your handle"}
                    </span>
                    <span className="text-[13px] font-medium text-zinc-200">@{myHandle}</span>
                  </button>
                )}

                <p className="mt-3 text-[12px] leading-relaxed text-zinc-600">
                  They need to have signed up first — then this handle opens the room.
                </p>
              </>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
