"use client";

import { AnimatePresence, motion } from "framer-motion";

/**
 * Pulses land as light, not as messages: a warm wash over the room and a few hearts
 * rising out of the composer. Nothing is stored in the thread.
 */
export function PulseOverlay({
  burst,
  incomingText,
  incoming,
}: {
  burst: number;
  incomingText: string | null;
  incoming: boolean;
}) {
  const hearts = [0, 1, 2, 3, 4];

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden" aria-hidden>
      <AnimatePresence>
        {burst > 0 && (
          <motion.div
            key={burst}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{ duration: 1.6, times: [0, 0.25, 1] }}
              className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,92,122,0.35),transparent_62%)]"
            />
            {hearts.map((i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 0, scale: 0.7 }}
                animate={{
                  opacity: [0, 1, 0],
                  y: -180 - i * 28,
                  x: (i - 2) * 16,
                  scale: [0.7, 1.05, 0.9],
                  rotate: (i - 2) * 8,
                }}
                transition={{ duration: 2.1 + i * 0.12, delay: i * 0.08, ease: "easeOut" }}
                className="absolute bottom-24 left-1/2 text-rose"
                style={{ marginLeft: -10 }}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                  <path d="M12 21s-7.5-4.7-9.6-9A5.4 5.4 0 0 1 12 6.1 5.4 5.4 0 0 1 21.6 12C19.5 16.3 12 21 12 21z" />
                </svg>
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {incoming && incomingText && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-x-0 top-20 flex justify-center px-6"
          >
            <div className="flex items-center gap-2 rounded-full border border-rose/30 bg-[#1A1014]/95 px-3.5 py-1.5 text-[12px] text-rose shadow-glow backdrop-blur">
              <motion.span
                animate={{ scale: [1, 1.18, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                  <path d="M12 21s-7.5-4.7-9.6-9A5.4 5.4 0 0 1 12 6.1 5.4 5.4 0 0 1 21.6 12C19.5 16.3 12 21 12 21z" />
                </svg>
              </motion.span>
              {incomingText}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
