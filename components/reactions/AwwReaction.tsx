"use client";

import { useId } from "react";

/** Soft closed eyes, blush cheeks, one tear — the "aww". */
export function AwwReaction({ size = 28, className }: { size?: number; className?: string }) {
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
        <linearGradient id={`aww-${id}`} x1="8" y1="5" x2="20" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC9D6" />
          <stop offset="1" stopColor="#FFA6BC" />
        </linearGradient>
      </defs>

      <circle cx="14" cy="14.3" r="9.6" fill={`url(#aww-${id})`} />

      {/* blush */}
      <ellipse cx="8.1" cy="16.5" rx="2.2" ry="1.5" fill="#FF5C7A" opacity="0.4" />
      <ellipse cx="19.9" cy="16.5" rx="2.2" ry="1.5" fill="#FF5C7A" opacity="0.4" />

      {/* soft closed eyes */}
      <path d="M8.4 13.2c1-1.35 2.5-1.35 3.5 0" stroke="#5C2433" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16.1 13.2c1-1.35 2.5-1.35 3.5 0" stroke="#5C2433" strokeWidth="1.7" strokeLinecap="round" />

      {/* small smile */}
      <path d="M11.6 17.4c.7 1.5 4.1 1.5 4.8 0" stroke="#5C2433" strokeWidth="1.6" strokeLinecap="round" />

      {/* one tear, bottom right */}
      <path d="M20.6 18.4c.85 1.05.85 2 0 2.5-.85-.5-.85-1.45 0-2.5z" fill="#8FD6FF" />
    </svg>
  );
}
