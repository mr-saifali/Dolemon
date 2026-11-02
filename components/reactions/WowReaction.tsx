"use client";

import { useId } from "react";

/** Wide eyes, small "o" mouth — the quiet "no way". */
export function WowReaction({ size = 28, className }: { size?: number; className?: string }) {
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
        <linearGradient id={`wow-${id}`} x1="8" y1="5" x2="20" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC6B4" />
          <stop offset="1" stopColor="#FF9E8C" />
        </linearGradient>
      </defs>

      <circle cx="14" cy="14.3" r="9.6" fill={`url(#wow-${id})`} />

      {/* eyebrows float high — that's what sells the surprise */}
      <path d="M8.2 8.9c1.1-.7 2.2-.7 3.2-.1" stroke="#5A2B24" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16.6 8.8c1-.6 2.1-.6 3.2.1" stroke="#5A2B24" strokeWidth="1.5" strokeLinecap="round" />

      {/* wide open eyes */}
      <circle cx="10.3" cy="12.9" r="2.5" fill="#FFFFFF" />
      <circle cx="10.4" cy="13.1" r="1.15" fill="#3A1D18" />
      <circle cx="17.7" cy="12.9" r="2.5" fill="#FFFFFF" />
      <circle cx="17.6" cy="13.1" r="1.15" fill="#3A1D18" />

      {/* small "o" */}
      <ellipse cx="14" cy="19.2" rx="2.1" ry="2.5" fill="#3A1D18" />
    </svg>
  );
}
