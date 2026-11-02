"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Paperclip, X } from "lucide-react";
import { PulseButton } from "./pulse-button";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  onPulse,
  onAttach,
  pulseCoolingUntil = 0,
  pulseDisabled,
  placeholder = "Message",
  hint,
  replyTo,
  onCancelReply,
}: {
  onSend: (text: string) => void;
  onPulse: () => void;
  onAttach?: () => void;
  pulseCoolingUntil?: number;
  pulseDisabled?: boolean;
  placeholder?: string;
  hint?: React.ReactNode;
  replyTo?: { author: string; text: string } | null;
  onCancelReply?: () => void;
}) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  const grow = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
    requestAnimationFrame(() => {
      if (area.current) {
        area.current.style.height = "auto";
        area.current.focus();
      }
    });
  };

  return (
    <div className="border-t border-white/[0.05] bg-ink/85 px-4 pb-3 pt-2.5 backdrop-blur-xl safe-b">
      {hint && <div className="mb-2 px-1 text-[11.5px] text-text-muted/70">{hint}</div>}

      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-ink-line bg-ink-surface/80 px-3 py-2">
          <div className="h-6 w-0.5 rounded-full bg-rose" />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] uppercase tracking-[0.12em] text-rose/80">Replying to {replyTo.author}</p>
            <p className="truncate text-[12px] text-text-muted">{replyTo.text || "attachment"}</p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancel reply"
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        className={cn(
          "flex items-end gap-1.5 rounded-[26px] border bg-ink-surface/90 p-1.5 pl-2 transition-all duration-200",
          focused ? "border-rose/40 shadow-[0_0_0_4px_rgba(255,92,122,0.07)]" : "border-ink-line"
        )}
      >
        {onAttach && (
          <motion.button
            type="button"
            onClick={onAttach}
            aria-label="Attach"
            whileTap={{ scale: 0.9 }}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </motion.button>
        )}

        <textarea
          ref={area}
          rows={1}
          value={value}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-[120px] min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-snug text-text placeholder:text-text-muted/70"
        />

        <PulseButton onPulse={onPulse} coolingUntil={pulseCoolingUntil} disabled={pulseDisabled} />

        <motion.button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Send message"
          animate={{ scale: value.trim() ? 1 : 0.92, opacity: value.trim() ? 1 : 0.7 }}
          transition={{ duration: 0.16 }}
          whileTap={{ scale: 0.9 }}
          className={cn(
            "mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors",
            value.trim()
              ? "bg-rose text-[#1A0A0F] shadow-[0_8px_22px_-8px_rgba(255,92,122,0.9)]"
              : "bg-white/[0.06] text-text-muted/50"
          )}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.4} />
        </motion.button>
      </div>

      <p className="mt-2 text-center text-[10.5px] text-text-muted/45">
        Tap the heart to say “thinking of you” — it leaves no message.
      </p>
    </div>
  );
}
