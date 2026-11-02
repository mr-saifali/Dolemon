"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The pulse affordance: one tap sends "thinking of you" without writing a message.
 * The ring drains while you're on cooldown so the limit is felt, not explained.
 */
export function PulseButton({
  onPulse,
  coolingUntil,
  disabled,
}: {
  onPulse: () => void;
  coolingUntil: number;
  disabled?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const cooling = now < coolingUntil;
  const total = 15_000;
  const progress = cooling ? Math.min(1, (coolingUntil - now) / total) : 0;

  useEffect(() => {
    if (!cooling) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [cooling]);

  return (
    <motion.button
      type="button"
      onClick={onPulse}
      disabled={disabled || cooling}
      aria-label={cooling ? "Pulse recharging" : "Send a pulse"}
      title="Thinking of you"
      whileTap={{ scale: 0.88 }}
      className={cn(
        "relative mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
        cooling || disabled
          ? "text-rose/35"
          : "text-rose hover:bg-rose/10",
      )}
    >
      {cooling && (
        <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 40 40" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(255,92,122,0.18)" strokeWidth="2" />
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="#FF5C7A"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 18}
            strokeDashoffset={2 * Math.PI * 18 * (1 - progress)}
            opacity={0.8}
          />
        </svg>
      )}
      <Heart
        className={cn("h-[18px] w-[18px] transition-transform", !cooling && !disabled && "fill-rose/25")}
        strokeWidth={2}
      />
    </motion.button>
  );
}
