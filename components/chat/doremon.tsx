"use client";

import { motion } from "framer-motion";
import { clockTime } from "@/lib/thread";
import { displayDoremonText } from "@/lib/doremon/display";
import type { DoremonMemory } from "@/lib/doremon/types";
import { cn } from "@/lib/utils";

/** Doremon's identity is shared across the AI room, messages and inbox. */
const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;

export function DoremonFace({ size = 24, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/images/ai-agent.png?v=1" width={size} height={size} alt="" aria-hidden="true"
      className={cn("shrink-0 rounded-full object-cover", className)} />
  );
}

export type DoremonMessageView = {
  id: string;
  kind: "greeting" | "intervention" | "answer" | "note";
  text: string;
  at: number;
};

/** One line from Doremon, inside the chat flow. */
export function DoremonBubble({ message, animateIn = true }: { message: DoremonMessageView; animateIn?: boolean }) {
  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 10, x: -8, scale: 0.96 } : false}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={SPRING}
      className="flex w-full justify-start mt-3"
    >
      <div className="relative flex max-w-[85%] flex-col items-start rounded-[20px] rounded-bl-[4px] border px-3.5 py-2.5">
        <div
          className="absolute inset-0 rounded-[20px] rounded-bl-[4px]"
          aria-hidden
          style={{
            background: "linear-gradient(160deg, rgba(41,171,226,0.14) 0%, rgba(41,171,226,0.05) 70%)",
          }}
        />
        <div
          className="absolute inset-0 rounded-[20px] rounded-bl-[4px]"
          aria-hidden
          style={{ boxShadow: "inset 0 0 0 1px rgba(41,171,226,0.38)" }}
        />
        <div className="relative flex w-full items-center gap-2">
          <DoremonFace size={22} />
          <span className="text-[12px] font-medium tracking-wide text-[#8FD9F8]">Doremon</span>
          <span className="ml-auto text-[10px] leading-none tabular-nums text-white/40">
            {clockTime(message.at)}
          </span>
        </div>
        <p className="relative mt-1.5 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-zinc-100">
          {displayDoremonText(message.text)}
        </p>
      </div>
    </motion.div>
  );
}

/** The beat where Doremon is thinking. */
export function DoremonThinking() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, x: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={SPRING}
      className="flex w-full justify-start mt-3"
    >
      <div
        className="relative flex items-center gap-2.5 rounded-[20px] rounded-bl-[4px] px-3.5 py-3"
        style={{
          background: "linear-gradient(160deg, rgba(41,171,226,0.14) 0%, rgba(41,171,226,0.05) 70%)",
          boxShadow: "inset 0 0 0 1px rgba(41,171,226,0.38)",
        }}
      >
        <DoremonFace size={22} className="animate-pulse-soft" />
        <span className="text-[13px] text-[#8FD9F8]">Doremon is thinking</span>
        <span className="flex items-center gap-0.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1 w-1 rounded-full bg-[#8FD9F8]"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.18 }}
            />
          ))}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * The header presence: Doremon keeps an eye on the room.
 * Dot: mint = watching · amber pulse = thinking. Tap opens his private room.
 */
export function DoremonPresence({
  status,
  onTap,
}: {
  status: "idle" | "watching" | "thinking";
  memory: DoremonMemory | null;
  onTap: () => void;
}) {
  const label = status === "thinking" ? "Doremon is thinking" : "Open Doremon room";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background: "linear-gradient(160deg, rgba(41,171,226,0.35), rgba(41,171,226,0.08))",
          boxShadow: "inset 0 0 0 1px rgba(41,171,226,0.4)",
        }}
      />
      <DoremonFace size={26} className="relative" />
      <span
        aria-hidden
        className={cn(
          "absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#09090B]",
          status === "thinking" ? "bg-amber animate-pulse-soft" : "bg-mint"
        )}
      />
    </button>
  );
}
