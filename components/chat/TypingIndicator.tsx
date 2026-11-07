"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Only appears after the partner has been typing for 500ms — a flicker of keystrokes
 * shouldn't put words in the room.
 */
export function TypingIndicator({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.96 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-start pt-1"
          aria-live="polite"
          aria-label="Typing"
        >
          <div className="flex h-9 items-center gap-1 rounded-[20px] rounded-bl-[6px] border border-[color:var(--message-outline,rgba(255,255,255,0.3))] bg-[color:var(--message-incoming,rgba(0,0,0,0.2))] px-3.5 backdrop-blur-md">
            {[0, 150, 300].map((delay) => (
              <motion.span
                key={delay}
                className="h-[5px] w-[5px] rounded-full bg-white/70"
                animate={{ y: [0, -4, 0], opacity: [0.45, 1, 0.45] }}
                transition={{
                  duration: 0.9,
                  repeat: Infinity,
                  delay: delay / 1000,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
