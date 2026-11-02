"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  invalid,
  autoFocus = true,
  disabled,
}: {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const chars = value.padEnd(length, " ").slice(0, length).split("");

  const setDigit = (idx: number, digit: string) => {
    const next = value.padEnd(length, " ").split("");
    next[idx] = digit || " ";
    const joined = next.join("").replace(/\s+$/, "");
    onChange(joined.replace(/\s/g, ""));
  };

  const handleChange = (idx: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    if (digits.length > 1) {
      // paste / autofill
      const merged = (value.slice(0, idx) + digits).replace(/\D/g, "").slice(0, length);
      onChange(merged);
      const target = Math.min(merged.length, length - 1);
      refs.current[target]?.focus();
      if (merged.length === length) onComplete?.(merged);
      return;
    }
    setDigit(idx, digits);
    const nextValue = (value.slice(0, idx) + digits + value.slice(idx + 1)).slice(0, length);
    if (nextValue.length === length) onComplete?.(nextValue);
    else refs.current[Math.min(idx + 1, length - 1)]?.focus();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (!value) return;
      // Digits stay packed left-to-right, so backspace always drops the last one
      // and parks the caret on the first empty box.
      const next = value.slice(0, -1);
      onChange(next);
      refs.current[Math.max(next.length, 0)]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < length - 1) refs.current[idx + 1]?.focus();
  };

  return (
    <div className="flex items-center justify-between gap-2" role="group" aria-label="6-digit verification code">
      {Array.from({ length }).map((_, idx) => {
        const char = chars[idx] === " " ? "" : chars[idx];
        return (
          <input
            key={idx}
            ref={(el) => { refs.current[idx] = el; }}
            value={char}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            onFocus={() => setFocusedIdx(idx)}
            onBlur={() => setFocusedIdx(null)}
            disabled={disabled}
            inputMode="numeric"
            autoComplete={idx === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${idx + 1}`}
            maxLength={1}
            className={cn(
              "h-16 w-full rounded-field border bg-ink-surface text-center text-[22px] font-semibold tabular-nums text-text transition-all duration-200",
              "border-ink-line hover:border-[#3A3A45]",
              focusedIdx === idx && "border-rose/70 ring-4 ring-rose/10",
              invalid && "border-danger/70 text-danger ring-danger/10",
              char && !invalid && "border-white/20"
            )}
          />
        );
      })}
    </div>
  );
}
