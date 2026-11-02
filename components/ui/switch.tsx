"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  icon,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  /** iOS-settings style coloured glyph tile */
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      {icon}
      <div className="min-w-0 flex-1">
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
          "relative mt-0.5 h-[28px] w-[48px] shrink-0 rounded-full transition-colors duration-200",
          checked
            ? "bg-[linear-gradient(135deg,#FF5C7A,#FFA07A)] shadow-[0_4px_14px_-5px_rgba(255,92,122,0.95)]"
            : "bg-[#2A2A30]",
          disabled && "opacity-50"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={cn(
            "absolute top-1/2 h-[24px] w-[24px] -translate-y-1/2 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.35)]",
            checked ? "left-[22px] bg-white" : "left-[2px] bg-[#9A9AA2]"
          )}
        />
      </button>
    </div>
  );
}
