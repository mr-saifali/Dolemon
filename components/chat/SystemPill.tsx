"use client";

import { motion } from "framer-motion";

/**
 * Every non-message row in the timeline — a date, a presence session, a call —
 * is one quiet pill. No cards, no buttons, no bold.
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
      <span className="inline-flex max-w-[92%] items-center gap-1.5 rounded-full bg-[color:var(--chat-label-bg,rgba(255,255,255,.08))] px-3 py-1.5 text-[11px] font-medium uppercase leading-none tracking-wider text-[color:var(--chat-label-text,#d4d4d8)]">
        {icon}
        <span className="truncate">{children}</span>
      </span>
    </motion.div>
  );
}
