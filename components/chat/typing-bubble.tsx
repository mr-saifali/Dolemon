"use client";

import { motion } from "framer-motion";

export function TypingBubble({ name }: { name: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.18 }}
      className="mt-2 flex items-end gap-2"
    >
      <div className="flex items-center gap-1 rounded-[20px] rounded-bl-[7px] border border-white/[0.05] bg-[#1F1F27] px-3.5 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-text-muted"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="pb-1 text-[10.5px] text-text-muted/60">{name} is typing</span>
    </motion.div>
  );
}
