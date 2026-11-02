"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChatAvatar } from "./chat-row";
import { searchUsers, type DbPerson } from "@/lib/db";

/**
 * Find someone by handle. Results drop down under the field so the inbox
 * itself never has to leave the screen.
 */
export function PeopleSearch({ onPick }: { onPick: (username: string) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<DbPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const term = query.trim().replace(/^@+/, "");
  const active = term.length >= 2;

  useEffect(() => {
    if (!active) {
      setPeople([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    const mine = ++seq.current;
    setLoading(true);
    setFailed(false);

    const handle = setTimeout(() => {
      searchUsers(term)
        .then((rows) => {
          if (seq.current !== mine) return;
          setPeople(rows);
        })
        .catch(() => {
          if (seq.current !== mine) return;
          setFailed(true);
          setPeople([]);
        })
        .finally(() => {
          if (seq.current === mine) setLoading(false);
        });
    }, 240);

    return () => clearTimeout(handle);
  }, [term, active]);

  return (
    <div className="relative z-30">
      <div className="relative">
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute left-4 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-zinc-600"
        >
          <circle cx="8.6" cy="8.6" r="5.4" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.8 12.8 16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.replace(/[^a-zA-Z0-9._@]/g, ""))}
          inputMode="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Find someone by handle"
          placeholder="Find someone by @handle"
          className="h-11 w-full rounded-full border border-white/[0.05] bg-[#121215] pl-10 pr-10 text-[14px] text-zinc-200 placeholder:text-zinc-600 transition-colors focus:border-white/10 focus:outline-none"
        />

        <AnimatePresence>
          {query.length > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/[0.06] text-[13px] leading-none text-zinc-400"
            >
              ×
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0D0D10] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.95)]"
          >
            {loading && people.length === 0 && (
              <p className="px-4 py-4 text-[12.5px] text-zinc-500">Looking…</p>
            )}

            {!loading && failed && (
              <p className="px-4 py-4 text-[12.5px] text-zinc-500">Couldn&apos;t search. Try again.</p>
            )}

            {!loading && !failed && people.length === 0 && (
              <p className="px-4 py-4 text-[12.5px] text-zinc-500">
                No one goes by that. They need to sign up first.
              </p>
            )}

            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => {
                  setQuery("");
                  onPick(person.username);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
              >
                <ChatAvatar avatarId={person.avatarId} avatarUrl={person.avatarUrl} name={person.username} size={38} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-zinc-100">
                    @{person.username}
                  </span>
                  <span className="block text-[11.5px] text-zinc-500">Open a room</span>
                </span>
                <span className="text-[13px] text-zinc-600">→</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
