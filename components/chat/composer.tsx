"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUp, Smile } from "lucide-react";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  placeholder = "Message",
  hint,
}: {
  onSend: (text: string) => void;
  placeholder?: string;
  hint?: React.ReactNode;
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

      <div
        className={cn(
          "flex items-end gap-2 rounded-[26px] border bg-ink-surface/90 p-1.5 pl-4 transition-all duration-200",
          focused ? "border-rose/40 shadow-[0_0_0_4px_rgba(255,92,122,0.07)]" : "border-ink-line"
        )}
      >
        <button
          type="button"
          aria-label="Emoji"
          className="mb-1 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text"
        >
          <Smile className="h-[18px] w-[18px]" />
        </button>

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
        Just the two of you. Nothing here is shared anywhere else.
      </p>
    </div>
  );
}
