"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, ImagePlus, Mic, Plus, Smile, X } from "lucide-react";
import { ReactionIcon } from "@/components/reactions";
import { PulseButton } from "./pulse-button";
import { REACTION_META, REACTION_TYPES, type ReactionType } from "@/lib/reactions";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;
const MAX_LINES_PX = 92;

export function ChatInput({
  onSend,
  onSticker,
  onPulse,
  onAttach,
  onVoice,
  onTyping,
  showPulse = true,
  pulseCoolingUntil = 0,
  pulseDisabled,
  placeholder = "Message",
  replyTo,
  onCancelReply,
  hint,
  disabled = false,
}: {
  onSend: (text: string) => void;
  onSticker: (type: ReactionType) => void;
  onPulse: () => void;
  onAttach: () => void;
  onVoice: () => void;
  /** fired while the user types — drives the partner's "typing…" */
  onTyping?: () => void;
  showPulse?: boolean;
  pulseCoolingUntil?: number;
  pulseDisabled?: boolean;
  placeholder?: string;
  replyTo?: { author: string; text: string } | null;
  onCancelReply?: () => void;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const hasText = value.trim().length > 0;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_LINES_PX)}px`;
  }, [value]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    setTrayOpen(false);
    // Keep the keyboard exactly where it is. Re-focusing an already-focused
    // field on iOS/Android makes the keyboard dip and come back — the glitch.
    if (document.activeElement !== area.current) {
      requestAnimationFrame(() => area.current?.focus());
    }
  };

  return (
    <div className="relative z-20">
      <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-2">
        {hint && <div className="mb-1.5 px-1 text-[11.5px] text-zinc-500">{hint}</div>}
        {/^\/doremon\b/i.test(value.trim()) && <p className="mb-2 px-1 text-xs leading-relaxed text-sky-200">Asking can send recent chat excerpts and memory to Google Gemini. Consider the other person’s consent; AI interpretations can be wrong.</p>}

        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-2 flex items-center gap-2 rounded-2xl bg-[#1C1C1E] px-3 py-2"
            >
              <span className="h-6 w-0.5 rounded-full bg-rose" />
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-rose/80">
                  Replying to {replyTo.author}
                </p>
                <p className="truncate text-[12px] text-zinc-500">{replyTo.text || "attachment"}</p>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                aria-label="Cancel reply"
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {trayOpen && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={SPRING}
              className="mb-2 rounded-[22px] border border-white/[0.06] bg-[#1C1C1E] p-2"
            >
              <p className="px-1.5 pb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-zinc-600">
                Bina shabdon ke
              </p>
              <div className="flex items-center justify-between">
                {REACTION_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      onSticker(type);
                      setTrayOpen(false);
                    }}
                    aria-label={`Send ${REACTION_META[type].label}`}
                    title={REACTION_META[type].means}
                    className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95 hover:bg-white/[0.05]"
                  >
                    <ReactionIcon type={type} size={28} />
                  </button>
                ))}
              </div>
              {showPulse && (
                <div className="mt-1 flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                  <span className="pl-1.5 text-[11px] text-zinc-500">Theek se kehna hai?</span>
                  <PulseButton onPulse={onPulse} coolingUntil={pulseCoolingUntil} disabled={pulseDisabled} />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-0.5 rounded-[28px] bg-[#1C1C1E] px-1.5 py-1 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65)]">
          <motion.button
            type="button"
            onClick={onAttach}
            disabled={disabled}
            aria-label="Add attachment"
            whileTap={{ scale: 0.9 }}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
          >
            <Plus className="h-6 w-6" strokeWidth={1.8} />
          </motion.button>

          <div className="flex min-w-0 flex-1 items-end px-1 py-2">
            <textarea
              ref={area}
              rows={1}
              value={value}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value.trim()) onTyping?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="max-h-[92px] min-h-[24px] w-full resize-none bg-transparent text-[16px] leading-[1.4] text-white outline-none placeholder:text-zinc-500"
            />
          </div>

          <motion.button
            type="button"
            onClick={onAttach}
            disabled={disabled}
            aria-label="Add a photo or file"
            whileTap={{ scale: 0.9 }}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
          >
            <ImagePlus className="h-5 w-5" strokeWidth={1.8} />
          </motion.button>

          <motion.button
            type="button"
            onClick={() => !disabled && setTrayOpen((o) => !o)}
            disabled={disabled}
            aria-label="Reactions"
            aria-expanded={trayOpen}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors hover:text-white",
              trayOpen ? "text-rose" : "text-zinc-400"
            )}
          >
            <Smile className="h-6 w-6" strokeWidth={1.8} />
          </motion.button>

          <div className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {hasText ? (
                <motion.button
                  key="send"
                  type="button"
                  onClick={submit}
                  disabled={disabled}
                  aria-label="Send message"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={SPRING}
                  whileTap={{ scale: 0.9 }}
                  // The tap must not steal focus from the field — that's what
                  // made the keyboard dip away and come back on send.
                  onPointerDown={(e) => e.preventDefault()}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[#FF5C7A] transition-colors hover:text-[#ff8198]"
                >
                  <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.6} />
                </motion.button>
              ) : (
                <motion.button
                  key="mic"
                  type="button"
                  onClick={onVoice}
                  disabled={disabled}
                  aria-label="Record a voice note"
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={SPRING}
                  whileTap={{ scale: 0.9 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white"
                >
                  <Mic className="h-6 w-6" strokeWidth={1.8} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
