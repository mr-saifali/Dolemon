"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { searchThread, type DbMessage } from "@/lib/db";
import type { ChatMessage } from "@/lib/thread";

type Result = { id: string; text: string; at: number; mine: boolean };

export function MessageSearchSheet({ open, onClose, conversationId, remote, me, messages }: {
  open: boolean; onClose: () => void; conversationId: string; remote: boolean;
  me: string | null; messages: ChatMessage[];
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialog.current?.querySelector<HTMLInputElement>("input")?.focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab" || !dialog.current) return;
      const controls = Array.from(dialog.current.querySelectorAll<HTMLElement>("input, button:not(:disabled)"));
      if (!controls.length) return;
      const i = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && i <= 0) { event.preventDefault(); controls[controls.length - 1].focus(); }
      else if (!event.shiftKey && (i < 0 || i === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", key); previous?.focus(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) { setResults([]); setError(false); setBusy(false); return; }
    let active = true;
    setBusy(true); setError(false); setResults([]);
    const timer = setTimeout(() => {
      const work = remote
        ? searchThread(conversationId, term).then((rows: DbMessage[]) => rows.map((row) => ({ id: row.id, text: row.body, at: row.at, mine: row.senderId === me })))
        : Promise.resolve(messages.filter((m) => m.kind === "text" && m.text.toLocaleLowerCase().includes(term.toLocaleLowerCase())).slice(-50).reverse().map((m) => ({ id: m.id, text: m.text, at: m.at, mine: m.author === "me" })));
      void work.then((rows) => { if (active) setResults(rows); }).catch(() => { if (active) { setResults([]); setError(true); } }).finally(() => { if (active) setBusy(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [open, query, conversationId, remote, me, messages]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="search-title" className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-[26px] border border-white/10 bg-[#14141A] p-5 shadow-card sm:rounded-[26px]">
      <div className="mb-4 flex items-center justify-between"><h2 id="search-title" className="text-lg font-semibold">Search messages</h2><button type="button" onClick={onClose} aria-label="Close search" className="rounded-full p-2 text-zinc-400"><X className="h-4 w-4" /></button></div>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3"><Search className="h-4 w-4 text-zinc-500" /><input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} placeholder="Search text messages" aria-label="Search text messages" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-white outline-none" /></label>
      <p className="py-2 text-xs text-zinc-500" role="status">{query.trim().length < 2 ? "Enter at least two characters." : busy ? "Searching…" : error ? "Search failed. Check your connection and try again." : `${results.length} result${results.length === 1 ? "" : "s"} (up to 50)`}</p>
      <ul className="min-h-0 overflow-y-auto">
        {results.map((result) => {
          const loaded = messages.some((m) => m.id === result.id);
          return <li key={result.id} className="border-t border-white/5 py-3"><p className="text-xs text-zinc-500">{result.mine ? "You" : "Them"} · {new Date(result.at).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">{result.text}</p>{loaded ? <button type="button" className="mt-2 text-xs text-sky-300 underline" onClick={() => { onClose(); requestAnimationFrame(() => document.getElementById(`message-${result.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })); }}>Show in chat</button> : <p className="mt-2 text-xs text-zinc-500">Load older messages to show this in the chat.</p>}</li>;
        })}
      </ul>
    </div>
  </div>;
}
