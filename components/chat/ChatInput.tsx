"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Mic, Plus, Smile, X } from "lucide-react";
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
  pulseCoolingUntil = 0,
  pulseDisabled,
  placeholder = "Message",
  replyTo,
  onCancelReply,
  hint,
}: {
  onSend: (text: string) => void;
  onSticker: (type: ReactionType) => void;
  onPulse: () => void;
  onAttach: () => void;
  onVoice: () => void;
  pulseCoolingUntil?: number;
  pulseDisabled?: boolean;
  placeholder?: string;
  replyTo?: { author: string; text: string } | null;
  onCancelReply?: () => void;
  hint?: React.ReactNode;
}) {
  const [value, setValue] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [focused, setFocused] = useState(false);
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
    if (!text) return;
    onSend(text);
    setValue("");
    setTrayOpen(false);
    requestAnimationFrame(() => area.current?.focus());
  };

  return (
    <div className="relative z-20 border-t border-white/[0.05] bg-[#0E0E11]">
      <div className="mx-auto w-full max-w-2xl px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2">
        {hint && <div className="mb-1.5 px-1 text-[11.5px] text-[#8E8E93]/75">{hint}</div>}

        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-2 flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-[#1A1A1F] px-3 py-2"
            >
              <span className="h-6 w-0.5 rounded-full bg-rose" />
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] uppercase tracking-[0.12em] text-rose/80">
                  Replying to {replyTo.author}
                </p>
                <p className="truncate text-[12px] text-[#8E8E93]">{replyTo.text || "attachment"}</p>
              </div>
              <button
                type="button"
                onClick={onCancelReply}
                aria-label="Cancel reply"
                className="flex h-7 w-7 items-center justify-center rounded-full text-[#8E8E93] hover:bg-white/[0.06] hover:text-text"
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
              className="mb-2 rounded-[20px] border border-white/[0.07] bg-[#232329] p-2"
            >
              <p className="px-1.5 pb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[#8E8E93]/70">
                Bina shabdon ke
              </p>
              <div className="flex items-center justify-between">
                {REACTION_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
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
              <div className="mt-1 flex items-center justify-between border-t border-white/[0.06] pt-1.5">
                <span className="pl-1.5 text-[11px] text-[#8E8E93]">Theek se kehna hai?</span>
                <PulseButton onPulse={onPulse} coolingUntil={pulseCoolingUntil} disabled={pulseDisabled} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-1.5">
          <motion.button
            type="button"
            onClick={onAttach}
            aria-label="Add attachment"
            whileTap={{ scale: 0.9 }}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8E8E93] transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <Plus className="h-5 w-5" />
          </motion.button>

          <div
            className={cn(
              "flex flex-1 items-end rounded-[28px] bg-[#1A1A1F] px-4 py-3 transition-shadow",
              focused && "shadow-[0_0_0_1px_rgba(255,92,122,0.35)]"
            )}
          >
            <textarea
              ref={area}
              rows={1}
              value={value}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="max-h-[92px] min-h-[24px] w-full resize-none bg-transparent text-[15px] leading-[1.4] text-text outline-none placeholder:text-[#8E8E93]/70"
            />
          </div>

          <motion.button
            type="button"
            onClick={() => setTrayOpen((o) => !o)}
            aria-label="Reactions"
            aria-expanded={trayOpen}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
              trayOpen ? "text-rose" : "text-[#8E8E93] hover:bg-white/[0.05] hover:text-text"
            )}
          >
            <Smile className="h-5 w-5" />
          </motion.button>

          <div className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {hasText ? (
                <motion.button
                  key="send"
                  type="button"
                  onClick={submit}
                  aria-label="Send message"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={SPRING}
                  whileTap={{ scale: 0.9 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FF5C7A,#FF8FA3)] text-white shadow-[0_10px_24px_-8px_rgba(255,92,122,0.85)]"
                >
                  <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.6} />
                </motion.button>
              ) : (
                <motion.button
                  key="mic"
                  type="button"
                  onClick={onVoice}
                  aria-label="Record a voice note"
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.85, opacity: 0 }}
                  transition={SPRING}
                  whileTap={{ scale: 0.9 }}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[#8E8E93] transition-colors hover:bg-white/[0.05] hover:text-text"
                >
                  <Mic className="h-[19px] w-[19px]" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
