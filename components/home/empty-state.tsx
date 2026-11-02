"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * The first thing a new person sees. Warm, quiet, and honest about what
 * Dolemon is: one room, one person, nothing else.
 */
export function HomeEmptyState({ onInvite }: { onInvite: () => void }) {
  const [howOpen, setHowOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col items-center pt-8 text-center"
    >
      {/* two rings leaning into each other */}
      <div className="relative mb-8 flex h-44 w-44 items-center justify-center">
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.30),rgba(255,140,90,0.10)_45%,transparent_72%)] blur-2xl"
          animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute h-28 w-28 rounded-full border border-rose-500/20 bg-rose-500/10 backdrop-blur-[2px]" />

        <svg
          width="164"
          height="128"
          viewBox="0 0 164 128"
          fill="none"
          aria-hidden
          className="relative"
        >
          <defs>
            <linearGradient id="dm-ring-a" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF5C7A" />
              <stop offset="100%" stopColor="#FF8FA3" />
            </linearGradient>
            <linearGradient id="dm-ring-b" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFB199" />
              <stop offset="100%" stopColor="#FF5C7A" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          <motion.circle
            cx="64"
            cy="64"
            r="36"
            stroke="url(#dm-ring-a)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="188 38"
            animate={{ rotate: 360 }}
            transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "64px 64px" }}
          />
          <motion.circle
            cx="100"
            cy="64"
            r="36"
            stroke="url(#dm-ring-b)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="156 70"
            animate={{ rotate: -360 }}
            transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "100px 64px" }}
          />
          <motion.circle
            cx="82"
            cy="64"
            r="3.2"
            fill="#FF5C7A"
            animate={{ opacity: [0.45, 1, 0.45], r: [2.8, 3.6, 2.8] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </div>

      <h2 className="text-xl font-medium tracking-tight text-white">It&apos;s a little quiet here.</h2>
      <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-zinc-400">
        Dolemon is just for you and your person. No groups, no noise. Invite the one person you
        want to talk to.
      </p>

      <motion.button
        type="button"
        onClick={onInvite}
        whileTap={{ scale: 0.97 }}
        animate={{
          boxShadow: [
            "0 0 18px rgba(255,92,122,0.25)",
            "0 0 30px rgba(255,92,122,0.45)",
            "0 0 18px rgba(255,92,122,0.25)",
          ],
        }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="mt-7 rounded-full bg-gradient-to-r from-[#FF5C7A] to-[#FF8FA3] px-6 py-3 text-[14px] font-medium text-white transition-transform duration-200 hover:scale-105 active:scale-100"
      >
        Invite your person
      </motion.button>

      <button
        type="button"
        onClick={() => setHowOpen(true)}
        className="mt-5 text-xs text-zinc-500 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-zinc-300"
      >
        How it works
      </button>

      <AnimatePresence>
        {howOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
            <motion.button
              type="button"
              aria-label="Close"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHowOpen(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="How Dolemon works"
              initial={{ y: 26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 18, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#111113] px-6 pb-[max(env(safe-area-inset-bottom),26px)] pt-6 sm:rounded-[26px]"
            >
              <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
              <h3 className="text-[17px] font-medium tracking-[-0.01em] text-zinc-100">
                Three small steps
              </h3>
              <ol className="mt-4 space-y-3.5 text-left">
                {[
                  ["Your account", "Email and a password. That's your key — no codes, no emails."],
                  ["Your handle", "Something small like @saif. It's how your person finds you."],
                  ["The room", "They sign up, search your handle, and the room opens for the two of you."],
                ].map(([title, body], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF5C7A]/15 text-[11px] font-medium text-[#FF8FA3]">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[13.5px] font-medium text-zinc-200">{title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-relaxed text-zinc-500">
                        {body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[11.5px] leading-relaxed text-zinc-600">
                Calls connect phone to phone, so the audio and video never pass through our servers.
              </p>
              <button
                type="button"
                onClick={() => setHowOpen(false)}
                className="mt-5 w-full rounded-full bg-white/[0.06] py-2.5 text-[13px] text-zinc-300 transition-colors hover:bg-white/[0.1]"
              >
                Got it
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
