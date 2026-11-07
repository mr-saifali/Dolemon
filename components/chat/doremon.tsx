"use client";

import { motion } from "framer-motion";
import { clockTime } from "@/lib/thread";
import type { DoremonMemory } from "@/lib/doremon/types";
import { cn } from "@/lib/utils";

/**
 * Doremon — the resident AI. His face, his bubbles, his "thinking" beat.
 * His blue is constant in both themes: it's *him*, not the app's palette.
 */

const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.7 } as const;

/** A little Doraemon-style face, drawn so it stays readable at 22px. */
export function DoremonFace({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <circle cx="50" cy="50" r="47" fill="#29ABE2" />
      <ellipse cx="50" cy="64" rx="37" ry="29" fill="#FFFFFF" />
      {/* eyes */}
      <ellipse cx="35" cy="38" rx="8" ry="10" fill="#FFFFFF" stroke="#111" strokeWidth="2" />
      <ellipse cx="65" cy="38" rx="8" ry="10" fill="#FFFFFF" stroke="#111" strokeWidth="2" />
      <circle cx="36" cy="41" r="3.4" fill="#111" />
      <circle cx="64" cy="41" r="3.4" fill="#111" />
      {/* nose + nose-to-mouth line */}
      <circle cx="50" cy="55" r="7" fill="#E53935" />
      <circle cx="47.5" cy="52.5" r="2" fill="#FFFFFF" opacity="0.85" />
      <line x1="50" y1="62" x2="50" y2="72" stroke="#111" strokeWidth="2.5" />
      {/* mouth */}
      <path d="M30 72 Q50 84 70 72" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
      {/* whiskers */}
      <g stroke="#111" strokeWidth="2" strokeLinecap="round">
        <line x1="16" y1="58" x2="30" y2="60" />
        <line x1="15" y1="68" x2="30" y2="68" />
        <line x1="16" y1="78" x2="30" y2="76" />
        <line x1="84" y1="58" x2="70" y2="60" />
        <line x1="85" y1="68" x2="70" y2="68" />
        <line x1="84" y1="78" x2="70" y2="76" />
      </g>
      {/* collar + bell */}
      <path d="M22 92 Q50 104 78 92" fill="none" stroke="#E53935" strokeWidth="7" strokeLinecap="round" />
      <circle cx="50" cy="97" r="8" fill="#F6C445" stroke="#B8860B" strokeWidth="1.5" />
      <line x1="50" y1="97" x2="50" y2="103" stroke="#B8860B" strokeWidth="1.5" />
    </svg>
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
          {message.text}
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
        <span className="text-[13px] text-[#8FD9F8]">Doremon soch raha hai</span>
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
  memory,
  onTap,
}: {
  status: "idle" | "watching" | "thinking";
  memory: DoremonMemory | null;
  onTap: () => void;
}) {
  const hot = memory?.tension != null && memory.tension >= 6;
  const label =
    status === "thinking"
      ? "Doremon: soch raha hai"
      : hot
        ? "Doremon: tension padh raha hai — tap karo, poochh lo"
        : "Doremon: har baat dekh raha hai — tap karo, uski room kholo";
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
