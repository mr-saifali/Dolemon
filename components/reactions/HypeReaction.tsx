"use client";

import { useId } from "react";

/** Flame, rose → orange, with a warm base glow. */
export function HypeReaction({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`hype-${id}`} x1="14" y1="3" x2="14" y2="24.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF5C7A" />
          <stop offset="1" stopColor="#FFB86B" />
        </linearGradient>
      </defs>

      {/* base glow — a flat shape, not a filter shadow */}
      <ellipse cx="14" cy="23.6" rx="7.2" ry="2.6" fill="#FFB86B" opacity="0.22" />

      <path
        d="M14.1 3.2c.5 3.4 1.1 5.4 2.6 7.4 1.5 2 2.6 3 4.1 4.6 1.3 1.4 1.9 3 1.7 4.7-.4 3.3-3.7 5.7-8 5.7-4.6 0-8-2.6-8.1-6.1-.1-2 .5-3.4 1.9-4.8 1-1 2.2-2.3 2.2-2.3.3 1.2.6 2.3 1.7 3 .3-2.5.5-5.1 1.3-7.6.3-1.2.4-2.4.6-4.6z"
        fill={`url(#hype-${id})`}
      />

      {/* inner flame */}
      <path
        d="M14.2 11.9c.9 2.2 1.4 3.2 2.6 4.4 1 .9 1.4 1.9 1.3 3-.2 2-2 3.3-4.2 3.3-2.4 0-4.1-1.4-4.1-3.4 0-1.1.4-1.9 1.2-2.7 1-1 1-2 1-2.6.7.3 1.4.4 2.2-2z"
        fill="#FFE3B8"
        opacity="0.85"
      />
    </svg>
  );
}
