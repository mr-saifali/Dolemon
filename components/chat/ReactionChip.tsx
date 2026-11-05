"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { ReactionIcon } from "@/components/reactions";
import type { ReactionType } from "@/lib/reactions";

const SPRING = { type: "spring", stiffness: 420, damping: 30 } as const;

/**
 * A small chip that hugs the corner of the bubble it belongs to — never floating
 * in the void. `mine` gets a quiet rose rim so it's obvious which face is yours.
 */
export function ReactionChip({
  type,
  count,
  mine,
  onTap,
  onLongPress,
  label,
}: {
  type: ReactionType;
  count: number;
  mine: boolean;
  onTap: () => void;
  onLongPress?: () => void;
  label: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const start = () => {
    if (!onLongPress) return;
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, 420);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <motion.button
      type="button"
      initial={{ scale: 0.6, y: 4, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={SPRING}
      whileTap={{ scale: 0.9 }}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onTap();
      }}
      aria-label={`${label}${count > 1 ? `, ${count}` : ""}${mine ? ", your reaction" : ""}`}
      aria-pressed={mine}
      className="flex items-center gap-1 rounded-full border border-white/10 bg-[#1C1C1E] px-1.5 py-0.5 text-xs shadow-sm"
    >
      <ReactionIcon type={type} size={15} />
      {count > 1 && <span className="text-[11px] leading-none tabular-nums text-zinc-400">{count}</span>}
    </motion.button>
  );
}
