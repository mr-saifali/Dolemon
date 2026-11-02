"use client";

import { useId } from "react";

/** Round face, closed-arc eyes, open smile, two tears, slight tilt. */
export function HahaReaction({ size = 28, className }: { size?: number; className?: string }) {
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
        <linearGradient id={`haha-${id}`} x1="8" y1="5" x2="20" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD98E" />
          <stop offset="1" stopColor="#FFAE7B" />
        </linearGradient>
      </defs>

      <g transform="rotate(-6 14 14)">
        <circle cx="14" cy="14.3" r="9.6" fill={`url(#haha-${id})`} />

        {/* closed, happy eyes */}
        <path d="M8.5 12.6c.95-1.75 2.75-1.75 3.7 0" stroke="#4A2A17" strokeWidth="1.85" strokeLinecap="round" />
        <path d="M15.8 12.6c.95-1.75 2.75-1.75 3.7 0" stroke="#4A2A17" strokeWidth="1.85" strokeLinecap="round" />

        {/* open laugh */}
        <path d="M9.4 16.6c1.15 4.3 8.05 4.3 9.2 0z" fill="#4A2A17" />
        <path d="M12.2 19.6c.55.9 3.05.9 3.6 0z" fill="#FF8FA3" />

        {/* tears of joy */}
        <path d="M5.6 14.2c.85 1 .85 1.9 0 2.4-.85-.5-.85-1.4 0-2.4z" fill="#8FD6FF" />
        <path d="M22.4 14.2c.85 1 .85 1.9 0 2.4-.85-.5-.85-1.4 0-2.4z" fill="#8FD6FF" />
      </g>
    </svg>
  );
}
