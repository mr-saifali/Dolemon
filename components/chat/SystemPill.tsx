"use client";

import { motion } from "framer-motion";

/**
 * Every non-message row in the timeline — a date, a presence session, a call —
 * is one quiet pill. No cards, no full-width blocks.
 */
export function SystemPill({
  icon,
  children,
  delay = 0,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1], delay }}
      className="flex justify-center py-2"
    >
      <span className="inline-flex max-w-[92%] items-center gap-1.5 rounded-full border border-white/5 bg-white/5 px-3 py-[5px] text-[10px] uppercase tracking-[0.13em] text-zinc-500">
        {icon}
        <span className="truncate">{children}</span>
      </span>
    </motion.div>
  );
}
