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
        <p className={cn("text-[14.5px]", disabled ? "text-zinc-600" : "text-zinc-200")}>{label}</p>
        {description && <p className="mt-0.5 text-[12.5px] text-zinc-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-[#FF5C7A]" : "bg-[#27272A]",
          disabled && "opacity-50"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={cn(
            "absolute top-1/2 h-[22px] w-[22px] -translate-y-1/2 rounded-full shadow-sm",
            checked ? "left-[22px] bg-white" : "left-[2px] bg-zinc-400"
          )}
        />
      </button>
    </div>
  );
}
