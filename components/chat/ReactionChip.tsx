"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { ReactionIcon } from "@/components/reactions";
import type { ReactionType } from "@/lib/reactions";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

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
      layout
      initial={{ scale: 0.6, y: 4, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={SPRING}
      whileTap={{ scale: 0.92 }}
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
      aria-label={`${label}${count > 1 ? `, ${count}` : ""}${mine ? ", tumhara reaction" : ""}`}
      aria-pressed={mine}
      className={cn(
        "flex h-6 items-center gap-1 rounded-full border px-[8px] transition-colors",
        mine
          ? "border-[rgba(255,92,122,0.4)] bg-[rgba(255,92,122,0.15)] text-text"
          : "border-white/[0.08] bg-[#232329] text-text"
      )}
    >
      <ReactionIcon type={type} size={16} />
      {count > 1 && <span className="text-[12px] leading-none tabular-nums">{count}</span>}
    </motion.button>
  );
}
