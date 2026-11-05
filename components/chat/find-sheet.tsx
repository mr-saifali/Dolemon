"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { previewFor, type ChatMessage } from "@/lib/thread";
import { expandQuery, type PersonalProfile } from "@/lib/personal/core";

/** In-chat search that understands YOUR private lexicon, not just literals. */
export function FindSheet({
  open,
  messages,
  profile,
  partnerName,
  onClose,
}: {
  open: boolean;
  messages: ChatMessage[];
  profile: PersonalProfile;
  partnerName: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const terms = useMemo(() => expandQuery(profile, query), [profile, query]);
  const results = useMemo(() => {
    if (terms.length === 0) return [];
    return messages
      .filter((m) => (m.author === "me" || m.author === "them") && terms.some((t) => previewFor(m).toLowerCase().includes(t)))
      .slice(-40)
      .reverse();
  }, [messages, terms]);

  const jump = (id: string) => {
    onClose();
    window.setTimeout(() => {
      document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 180);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close search"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Find in this chat"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="relative flex max-h-[78vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] border border-white/[0.07] bg-[#14141A] pb-6 sm:rounded-[24px]"
          >
            <div className="flex items-center gap-2 px-4 pb-3 pt-4">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a word, a promise, a joke…"
                className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/5">
                <X className="h-4 w-4" />
              </button>
            </div>

            {terms.length > 1 && (
              <p className="px-4 pb-2 text-[11px] text-zinc-500">
                Your lexicon also looked for: {terms.slice(1, 6).join(", ")}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto px-3">
              {query.trim() && results.length === 0 && (
                <p className="px-2 py-6 text-center text-[13px] text-zinc-500">Nothing here yet.</p>
              )}
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => jump(m.id)}
                  className="mb-1.5 flex w-full flex-col gap-0.5 rounded-xl bg-white/[0.03] px-3 py-2.5 text-left hover:bg-white/[0.06]"
                >
                  <span className="text-[10.5px] uppercase tracking-wide text-zinc-500">
                    {m.author === "me" ? "You" : partnerName} · {new Date(m.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                  <span className="line-clamp-2 text-[13px] text-zinc-200">{previewFor(m) || "attachment"}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
