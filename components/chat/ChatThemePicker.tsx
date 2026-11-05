"use client";

import { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { CHAT_THEMES, type ChatThemeId } from "@/lib/chat-themes";
import { cn } from "@/lib/utils";

/** A shared, keyboard-accessible picker for the default and individual chats. */
export function ChatThemePicker({ value, onChange }: { value: ChatThemeId; onChange: (id: ChatThemeId) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Choose a chat background</legend>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {CHAT_THEMES.map((theme) => {
          const selected = value === theme.id;
          return (
            <label key={theme.id} className="group min-w-0 cursor-pointer">
              <input
                type="radio"
                name={name}
                value={theme.id}
                checked={selected}
                onChange={() => onChange(theme.id)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "relative block aspect-[3/4] overflow-hidden rounded-2xl bg-[#17151e] bg-cover bg-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#111113]",
                  selected ? "ring-2 ring-[#FF7892] ring-offset-2 ring-offset-[#111113]" : "ring-1 ring-white/10 group-hover:ring-white/30"
                )}
                style={{ backgroundImage: theme.image ? `url(${theme.image})` : "radial-gradient(ellipse at 25% 20%, rgba(124,58,237,.3), transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(255,92,122,.18), transparent 55%)" }}
              >
                <span className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#FF5C7A] text-white shadow-lg">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className={cn("mt-2 block truncate text-center text-[11px] font-medium sm:text-xs", selected ? "text-zinc-100" : "text-zinc-500")}>
                {theme.name}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ChatThemeSheet({
  open, value, inherited, onChange, onReset, onClose,
}: {
  open: boolean;
  value: ChatThemeId;
  inherited: boolean;
  onChange: (id: ChatThemeId) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.querySelector<HTMLElement>('[aria-label="Chat options"]') ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>("button")?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)"));
      if (!controls.length) return;
      const current = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && (current < 0 || current === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button type="button" aria-label="Close chat themes" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/65" />
          <motion.div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="chat-theme-title" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: "spring", stiffness: 400, damping: 34 }} className="relative max-h-[min(90dvh,720px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[28px] bg-[#111113] px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-5 shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#FF8FA3]">Make it yours</p>
                <h2 id="chat-theme-title" className="mt-1 text-[20px] font-semibold tracking-tight text-white">A little room to breathe</h2>
                <p className="mt-1 text-[13px] text-zinc-500">Choose a backdrop for this chat, just for you.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close chat themes" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-6"><ChatThemePicker value={value} onChange={onChange} /></div>
            <div className="mt-6 flex items-center justify-between gap-4">
              <button type="button" onClick={onReset} disabled={inherited} className="text-left text-[12px] font-medium text-zinc-400 hover:text-white disabled:text-zinc-600">
                {inherited ? "Using your default" : "Use my default"}
              </button>
              <button type="button" onClick={onClose} className="rounded-full bg-[#FF5C7A] px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#ff7892]">Done</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
