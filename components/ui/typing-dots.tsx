"use client";

import { motion } from "framer-motion";

/** Three dots that breathe — used wherever someone is typing. */
export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[3px] ${className}`} aria-label="typing">
      {[0, 0.15, 0.3].map((delay) => (
        <motion.span
          key={delay}
          className="block h-[4px] w-[4px] rounded-full bg-current"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, delay, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
