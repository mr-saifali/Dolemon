"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

/**
 * A first-class timeline item: the thread remembers the times you were both here.
 * This is the thing a normal chat log can't show, so it gets its own card treatment.
 */
export function PresenceMoment({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      className="my-4 flex justify-center"
    >
      <div className="flex max-w-[86%] items-start gap-2.5 rounded-2xl border border-rose/15 bg-gradient-to-b from-rose/[0.09] to-transparent px-3.5 py-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose/15 text-rose">
          <Sparkles className="h-3 w-3" strokeWidth={2.4} />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-rose/80">
            Presence
          </p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-text/80">{text}</p>
        </div>
      </div>
    </motion.div>
  );
}
