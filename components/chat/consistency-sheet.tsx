"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { compareStatements } from "@/lib/statement-comparison";
import type { ChatMessage } from "@/lib/thread";

/** Compare only messages already visible to this user. No AI call or archive. */
export function ConsistencySheet({ messages, onClose, hasOlder, loadingOlder, onLoadOlder }: {
  messages: ChatMessage[]; onClose: () => void; hasOlder?: boolean; loadingOlder?: boolean; onLoadOlder?: () => Promise<void>;
}) {
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [compared, setCompared] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => messages.filter((m) => m.kind === "text" && (m.author === "me" || m.author === "them") && m.text.trim() && !m.id.startsWith("tmp_")).slice().reverse(), [messages]);
  const first = rows.find((m) => m.id === firstId);
  const second = rows.find((m) => m.id === secondId);
  const valid = first && second && first.id !== second.id && first.author === second.author;
  const result = valid && compared ? compareStatements(first.text, second.text) : null;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>("button")?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled),select:not(:disabled)") ?? []);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && (index < 0 || index === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);

  const label = (m: ChatMessage) => `${m.author === "me" ? "You" : "Other person"} · ${new Date(m.at).toLocaleString()} · ${m.text.replace(/\s+/g, " ").slice(0, 80)}`;
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="compare-title">
    <button type="button" className="absolute inset-0" aria-label="Close comparison" onClick={onClose} />
    <div ref={panel} className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] bg-[#18181b] p-5 pb-[max(24px,env(safe-area-inset-bottom))] sm:rounded-[24px]">
      <div className="flex items-start justify-between gap-3"><div><h2 id="compare-title" className="text-lg font-medium text-white">Compare statements</h2><p className="mt-1 text-xs leading-relaxed text-zinc-400">Compare two messages from the same person. Differences do not establish a lie; context and memory can change.</p></div><button type="button" onClick={onClose} aria-label="Close comparison" className="rounded-full p-2 text-zinc-400 hover:bg-white/5"><X className="h-5 w-5" /></button></div>
      <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-zinc-400">Runs locally on messages loaded in this chat. It does not send messages to AI, retain deleted messages, or inspect behavior.</p>
      <div className="mt-4 space-y-3">
        {[{ label: "First message", value: firstId, set: setFirstId }, { label: "Second message", value: secondId, set: setSecondId }].map(({ label: title, value, set }) => <label key={title} className="block text-xs text-zinc-400">{title}<select value={value} onChange={(e) => { set(e.target.value); setCompared(false); }} className="mt-1 w-full rounded-xl bg-[#27272a] px-3 py-2.5 text-sm text-zinc-100"><option value="">Choose a message</option>{rows.map((row) => <option key={row.id} value={row.id}>{label(row)}</option>)}</select></label>)}
        {hasOlder && onLoadOlder && <button type="button" disabled={loadingOlder} onClick={() => void onLoadOlder()} className="text-xs text-rose-300 disabled:opacity-50">{loadingOlder ? "Loading older messages…" : "Load older messages"}</button>}
        {first && second && !valid && <p role="status" className="text-xs text-zinc-400">Choose two different messages from the same person.</p>}
        <button type="button" disabled={!valid} onClick={() => setCompared(true)} className="w-full rounded-full bg-[#FF5C7A] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">Compare</button>
      </div>
      {result && first && second && <div className="mt-5 space-y-3 text-sm text-zinc-300" role="status">
        {[first, second].map((m) => <blockquote key={m.id} className="rounded-xl bg-white/5 p-3"><p className="mb-1 text-[11px] text-zinc-500">{m.author === "me" ? "You" : "Other person"} · {new Date(m.at).toLocaleString()}</p><p className="whitespace-pre-wrap break-words">{m.text}</p></blockquote>)}
        <p className="text-xs leading-relaxed text-zinc-400">Shared words: {result.shared.length ? result.shared.join(", ") : "none detected"}. {result.negationDiffers ? "One message contains a negation word and the other does not. " : ""}{result.firstNumbers.length && result.secondNumbers.length && result.firstNumbers.join(",") !== result.secondNumbers.join(",") ? `Numbers differ (${result.firstNumbers.join(", ")} vs ${result.secondNumbers.join(", ")}). ` : ""}These are surface-level cues only, not proof of inconsistency or dishonesty.</p>
      </div>}
    </div>
  </div>;
}
