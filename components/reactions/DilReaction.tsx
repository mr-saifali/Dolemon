"use client";

import { useId } from "react";

/** Warm heart — rose gradient, soft inner highlight, one sparkle. */
export function DilReaction({ size = 28, className }: { size?: number; className?: string }) {
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
        <linearGradient id={`dil-${id}`} x1="6" y1="7" x2="21" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF5C7A" />
          <stop offset="1" stopColor="#FF8FA3" />
        </linearGradient>
      </defs>

      {/* slightly lopsided heart so it reads as drawn, not icon-grid */}
      <path
        d="M14 23.9c-2.9-2-9.1-6.6-9.6-11-.4-3.4 2-6 5-5.8 1.9.1 3.5 1.2 4.6 3 1.1-1.8 2.7-2.9 4.6-3 3-.2 5.4 2.4 5 5.8-.5 4.4-6.7 9-9.6 11z"
        fill={`url(#dil-${id})`}
      />

      {/* inner highlight — no stroke, just a soft shape */}
      <ellipse cx="10.1" cy="11.4" rx="2.7" ry="1.5" transform="rotate(-28 10.1 11.4)" fill="#FFFFFF" opacity="0.34" />

      {/* sparkle, top-right */}
      <path
        d="M21.8 3.3c.18 1.35.6 1.77 1.95 1.95-1.35.18-1.77.6-1.95 1.95-.18-1.35-.6-1.77-1.95-1.95 1.35-.18 1.77-.6 1.95-1.95z"
        fill="#FFD9E0"
      />
    </svg>
  );
}
