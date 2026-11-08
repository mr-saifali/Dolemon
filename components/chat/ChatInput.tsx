"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Camera, FileText, ImagePlus, Mic, Plus, Smile, Video, X } from "lucide-react";
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
  onCamera,
  onVoice,
  onFile,
  onVideo,
  publicMedia = false,
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
  onSend: (text: string) => void | boolean;
  onSticker: (type: ReactionType) => void;
  onPulse: () => void;
  onAttach: () => void;
  onCamera: () => void;
  onVoice: () => void;
  onFile?: () => void;
  onVideo?: () => void;
  publicMedia?: boolean;
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  /** Typing pings are throttled: one broadcast every 1.5s, not one per key. */
  const lastTypingPing = useRef(0);
  const composer = useRef<HTMLDivElement | null>(null);
  const plus = useRef<HTMLButtonElement | null>(null);
  const hasText = value.trim().length > 0;
  const hasDraft = value.length > 0;

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_LINES_PX)}px`;
  }, [value]);

  useEffect(() => {
    if ((!optionsOpen && !trayOpen) || typeof window === "undefined") return;
    if (optionsOpen && document.activeElement === plus.current) {
      composer.current?.querySelector<HTMLButtonElement>('[role="group"][aria-label="Add to your message"] button')?.focus();
    }
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !composer.current?.contains(event.target)) { setOptionsOpen(false); setTrayOpen(false); }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); setOptionsOpen(false); setTrayOpen(false); plus.current?.focus();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onPointer); window.removeEventListener("keydown", onKey); };
  }, [optionsOpen, trayOpen]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    if (onSend(text) === false) return;
    setValue("");
    setTrayOpen(false);
    setOptionsOpen(false);
    // Keep the keyboard exactly where it is. Re-focusing an already-focused
    // field on iOS/Android makes the keyboard dip and come back — the glitch.
    if (document.activeElement !== area.current) {
      requestAnimationFrame(() => area.current?.focus());
    }
  };

  return (
    <div ref={composer} className="relative z-20">
      <div className="mx-auto flow-root w-full max-w-2xl pb-[env(safe-area-inset-bottom)] pt-1.5">
        {hint && <div className="mx-3 mb-1.5 px-1 text-[11.5px] text-zinc-500">{hint}</div>}
        {/^\/doremon\b/i.test(value.trim()) && <p className="mx-3 mb-2 px-1 text-xs leading-relaxed text-sky-200">Only generic labels and partial counts go to an external AI service; it cannot see message text. Ask the other person first; AI can be wrong.</p>}

        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              data-composer-reply="true"
              className="mx-4 mb-1 flex items-center gap-2 border-l-2 border-white/40 py-1 pl-2"
            >
              <div className="min-w-0 flex-1 text-[13px] text-white/70">
                <p className="truncate font-medium">Replying to {replyTo.author}</p>
                <p className="truncate">{replyTo.text || "attachment"}</p>
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

        {optionsOpen && !hasDraft && (
            <motion.div
              role="group" aria-label="Add to your message"
              initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }}
              transition={SPRING}
              className="mx-3 mb-2 rounded-[22px] border border-white/10 bg-[#1C1C1E]/95 p-3 shadow-xl backdrop-blur-xl"
            >
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                {[
                  { label: "Photo", icon: <ImagePlus />, action: onAttach },
                  { label: "Camera", icon: <Camera />, action: onCamera },
                  { label: "Voice note", icon: <Mic />, action: onVoice },
                  ...(onFile ? [{ label: "File", icon: <FileText />, action: onFile }] : []),
                  ...(onVideo ? [{ label: "Video", icon: <Video />, action: onVideo }] : []),
                  { label: "Stickers", icon: <Smile />, action: () => setTrayOpen(true) },
                ].map(({ label, icon, action }) => (
                  <button key={label} type="button" disabled={disabled} onClick={() => { setOptionsOpen(false); action(); }}
                    className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] text-zinc-300 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40">
                    <span className="[&>svg]:h-5 [&>svg]:w-5" aria-hidden>{icon}</span>{label}
                  </button>
                ))}
              </div>
              {publicMedia && <p role="note" className="mt-2 px-1 text-[11px] leading-relaxed text-amber-200/90">Photos, voice notes and files use public links. Videos use a private temporary handoff.</p>}
            </motion.div>
        )}

        {trayOpen && !hasDraft && (
            <motion.div
              role="group" aria-label="Stickers and reactions"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={SPRING}
              className="mx-3 mb-2 rounded-[22px] border border-white/[0.06] bg-[#1C1C1E] p-2"
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
                  <span className="pl-1.5 text-[11px] text-zinc-500">Say it kindly</span>
                  <PulseButton onPulse={onPulse} coolingUntil={pulseCoolingUntil} disabled={pulseDisabled} />
                </div>
              )}
            </motion.div>
        )}

        <div data-chat-composer="true" className="mx-3 mb-4 flex items-end gap-0.5 rounded-full border border-white/10 bg-black/40 px-1 py-1 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.65)] backdrop-blur-md">
          {!hasDraft && (
            <motion.button ref={plus} type="button" onClick={() => { setTrayOpen(false); setOptionsOpen((open) => !open); }}
              disabled={disabled} aria-label="Attachment options" aria-expanded={optionsOpen || trayOpen}
              whileTap={{ scale: 0.9 }}
              className={cn("mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center text-zinc-300 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40", optionsOpen && "text-rose")}
            >
              <Plus className={cn("h-6 w-6 transition-transform", optionsOpen && "rotate-45")} strokeWidth={1.8} />
            </motion.button>
          )}

          <div className="flex min-w-0 flex-1 items-end px-1 py-2">
            <textarea
              ref={area}
              rows={1}
              value={value}
              placeholder={placeholder}
              aria-label={placeholder}
              onChange={(e) => {
                setValue(e.target.value);
                if (e.target.value.length) { setOptionsOpen(false); setTrayOpen(false); }
                if (!e.target.value.trim()) return;
                const now = Date.now();
                if (now - lastTypingPing.current < 1500) return;
                lastTypingPing.current = now;
                onTyping?.();
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

          <AnimatePresence initial={false}>
            {hasDraft && (
              <motion.button
                key="send"
                type="button"
                onClick={submit}
                disabled={disabled || !hasText}
                aria-label="Send message"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={SPRING}
                whileTap={{ scale: 0.9 }}
                // Keep focus in the field so the keyboard doesn't dip on send.
                onPointerDown={(e) => e.preventDefault()}
                className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#FF5C7A] transition-colors hover:text-[#ff8198] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40"
              >
                <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.6} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
