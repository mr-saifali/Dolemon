"use client";

import { REACTION_EMOJI, type ReactionType } from "@/lib/reactions";

export type ReactionIconProps = { size?: number; className?: string };

/** Native Unicode emoji: Apple Color Emoji on Apple devices, the system emoji elsewhere. */
export function ReactionIcon({ type, size = 28, className }: ReactionIconProps & { type: ReactionType }) {
  return <span aria-hidden="true" className={className} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size, fontSize: size * 0.9, lineHeight: 1, fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}>{REACTION_EMOJI[type] ?? REACTION_EMOJI.dil}</span>;
}
