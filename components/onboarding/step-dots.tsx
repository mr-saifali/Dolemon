"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function StepDots({ current, total = 4 }: { current: number; total?: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const idx = i + 1;
        const done = idx < current;
        const active = idx === current;
        return (
          <div
            key={i}
            className={cn(
              "h-1 overflow-hidden rounded-full transition-colors duration-300",
              active ? "w-6 bg-rose/30" : done ? "w-2 bg-rose/60" : "w-2 bg-white/10"
            )}
          >
            {active && (
              <motion.div
                layoutId="step-pill"
                className="h-full w-full rounded-full bg-rose"
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
