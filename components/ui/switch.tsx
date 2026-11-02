"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className={cn("text-[14px] font-medium", disabled ? "text-text/40" : "text-text")}>{label}</p>
        {description && (
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{description}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-rose/40 bg-rose/25" : "border-ink-line bg-white/[0.05]",
          disabled && "opacity-50"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={cn(
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-colors",
            checked ? "left-[26px] bg-rose" : "left-1 bg-[#6B6B74]"
          )}
        />
      </button>
    </div>
  );
}
