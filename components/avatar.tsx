"use client";

import { avatarById } from "@/lib/avatars";
import { cn } from "@/lib/utils";
import { initialsFor } from "@/lib/chat";

const SIZES = {
  xs: { box: "h-9 w-9 rounded-full text-[13px]", dot: "h-2.5 w-2.5 border-2" },
  sm: { box: "h-9 w-9 rounded-xl text-[15px]", dot: "h-2.5 w-2.5 border-2" },
  md: { box: "h-12 w-12 rounded-2xl text-xl", dot: "h-3 w-3 border-2" },
  lg: { box: "h-14 w-14 rounded-2xl text-2xl", dot: "h-3.5 w-3.5 border-[2.5px]" },
} as const;

export function Avatar({
  avatarId,
  name,
  size = "md",
  online,
  className,
}: {
  avatarId: string | null;
  name: string;
  size?: keyof typeof SIZES;
  online?: boolean;
  className?: string;
}) {
  const preset = avatarById(avatarId);
  const s = SIZES[size];

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn("flex items-center justify-center border border-white/[0.06]", s.box)}
        style={{
          backgroundColor: preset?.bg ?? "rgba(255,92,122,0.12)",
          boxShadow: preset ? `inset 0 0 0 1px ${preset.ring}22` : undefined,
        }}
      >
        {preset ? (
          <span aria-hidden>{preset.emoji}</span>
        ) : (
          <span className="text-[13px] font-semibold tracking-wide text-rose/90">
            {initialsFor(name)}
          </span>
        )}
      </div>
      {online && (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full border-ink bg-success",
            s.dot
          )}
          aria-label="Online"
        />
      )}
    </div>
  );
}
