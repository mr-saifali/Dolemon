"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import { FEATURED_CHAT_THEMES, LEGACY_CHAT_THEMES, NIGHT_CHAT_THEMES, VIVID_CHAT_THEMES, getChatTheme, type ChatTheme, type ChatThemeId } from "@/lib/chat-themes";
import { removeCustomWallpaper, saveCustomWallpaper, useCustomWallpaper } from "@/lib/custom-wallpaper";
import { DEFAULT_CHAT_THEME } from "@/lib/chat-themes";
import { getPrefs, setPref } from "@/lib/prefs";
import { clearCustomChatThemes } from "@/lib/conversation-meta";
import { cn } from "@/lib/utils";

/** A shared, keyboard-accessible picker for the default and individual chats. */
export function ChatThemePicker({ value, onChange }: { value: ChatThemeId; onChange: (id: ChatThemeId) => void }) {
  const name = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const sequence = useRef(0);
  const custom = useCustomWallpaper();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { sequence.current++; }, []);
  const select = (id: ChatThemeId) => { sequence.current++; setError(null); onChange(id); };
  const upload = async (file?: File) => {
    if (!file || busy) return;
    const current = ++sequence.current;
    setBusy(true); setError(null);
    try {
      await saveCustomWallpaper(file);
      if (current === sequence.current) onChange("custom");
    } catch (err) {
      if (current === sequence.current) setError(err instanceof Error ? err.message : "Couldn't save that image.");
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return;
    const current = ++sequence.current;
    setBusy(true); setError(null);
    try {
      await removeCustomWallpaper();
      if (getPrefs().chatTheme === "custom") setPref("chatTheme", DEFAULT_CHAT_THEME);
      clearCustomChatThemes();
      if (current === sequence.current && value === "custom") onChange(DEFAULT_CHAT_THEME);
    } catch { if (current === sequence.current) setError("Couldn't remove the saved image."); }
    finally { setBusy(false); }
  };
  const circle = (theme: ChatTheme, image?: string | null) => (
    <ThemeCircle key={theme.id} theme={theme} name={name} selected={value === theme.id} onSelect={() => select(theme.id)} image={image} disabled={busy && theme.id === "custom"} />
  );

  return (
    <fieldset>
      <legend className="sr-only">Choose a chat background</legend>
      <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
        {FEATURED_CHAT_THEMES.map((id) => circle(getChatTheme(id)))}
        {(custom || value === "custom") && circle(getChatTheme("custom"), custom)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 text-[13px] font-medium text-zinc-100 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose disabled:opacity-50">
          <Plus className="h-4 w-4 text-rose" aria-hidden="true" />
          {busy ? "Saving…" : custom ? "Change custom image" : "Upload Custom"}
        </button>
        {custom && <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-11 px-1 text-xs text-zinc-400 underline underline-offset-4 hover:text-zinc-100 disabled:opacity-50">Remove image</button>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void upload(file); }} />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-zinc-500">JPG, PNG or WebP up to 10 MB. One image is shared across chats on this device and visible to anyone using Dolemon here. It is blurred and darkened; removing it resets custom choices.</p>
      {value === "custom" && !custom && <p role="status" className="mt-2 text-xs text-zinc-400">Your custom image is loading or unavailable. The default background is shown until it is available.</p>}
      {error && <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p>}
      <div className="mt-6">
        <p className="text-xs font-medium text-zinc-300">Light &amp; vivid</p>
        <div className="-mx-1 mt-3 flex gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {VIVID_CHAT_THEMES.map((theme) => circle(theme))}
        </div>
      </div>
      <div className="mt-3">
        <p className="text-xs font-medium text-zinc-300">After dark</p>
        <div className="-mx-1 mt-3 flex gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {NIGHT_CHAT_THEMES.map((theme) => circle(theme))}
        </div>
      </div>
      <details className="mt-5" open={LEGACY_CHAT_THEMES.some((theme) => theme.id === value) || undefined}>
        <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-100">More wallpapers</summary>
        <div className="-mx-1 mt-3 flex gap-4 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {LEGACY_CHAT_THEMES.map((theme) => circle(theme))}
        </div>
      </details>
    </fieldset>
  );
}

function ThemeCircle({ theme, name, selected, onSelect, image, disabled }: { theme: ChatTheme; name: string; selected: boolean; onSelect: () => void; image?: string | null; disabled?: boolean }) {
  const background = image ? `url("${image}")` : theme.image ? `url("${theme.image}")` :
    theme.id === "midnight" ? "radial-gradient(ellipse at 75% 10%, #142650, #050507)" :
    theme.id === "rosewater" ? "linear-gradient(145deg, #a5797d, #7e6179)" :
    theme.id === "pattern" ? "radial-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(#121212, #121212)" :
    theme.id === "solid" ? "linear-gradient(#000, #000)" :
    "radial-gradient(ellipse at 80% 20%, rgba(255,92,122,.22), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(107,76,255,.22), transparent 55%), linear-gradient(#09090b, #09090b)";
  return (
    <label className="group flex w-[84px] shrink-0 cursor-pointer flex-col items-center gap-2 text-center">
      <input type="radio" name={name} value={theme.id} checked={selected} disabled={disabled} onChange={onSelect} className="peer sr-only" />
      <span aria-hidden="true" className={cn("relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 bg-[#09090B] bg-cover bg-center transition-[border-color,box-shadow] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-white", selected ? "border-[#FF5C7A] shadow-[0_0_0_3px_rgba(255,92,122,.15)]" : "border-white/15 group-hover:border-white/40")} style={{ backgroundImage: background, ...(theme.image ? { backgroundPosition: "center 75%" } : {}), ...(theme.id === "pattern" ? { backgroundSize: "10px 10px, cover" } : {}) }}>
        {image && <span className="absolute inset-0 bg-black/40" />}
        {selected && <Check className="relative h-5 w-5 rounded-full bg-black/60 p-0.5 text-white drop-shadow-md" strokeWidth={2.5} />}
      </span>
      <span className={cn("w-full text-[11px] leading-tight", selected ? "font-semibold text-zinc-100" : "text-zinc-500")}>{theme.name}</span>
    </label>
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
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"]), summary')).filter((el) => !el.closest("details:not([open])") || el.tagName === "SUMMARY");
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
