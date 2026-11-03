"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, X } from "lucide-react";

/**
 * The editing bar that slides in above the composer. Same text, same place —
 * you rewrite the line you already sent and everything else stays put.
 */
export function EditBar({
  text,
  onSave,
  onCancel,
}: {
  text: string;
  onSave: (next: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(text);
  const [saving, setSaving] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [value]);

  const save = async () => {
    const next = value.trim();
    if (!next || next === text.trim() || saving) {
      if (!next || next === text.trim()) onCancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="px-3 pb-2"
    >
      <div className="hairline rounded-[18px] bg-[#191919] p-2.5">
        <div className="flex items-center gap-1.5 px-1 pb-1.5">
          <Pencil className="h-3 w-3 text-[#FF8FA3]" />
          <span className="text-[11px] font-medium tracking-wide text-[#FF8FA3]">Editing message</span>
        </div>

        <textarea
          ref={area}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void save();
            }
          }}
          rows={1}
          className="w-full resize-none bg-transparent px-1 text-[15px] leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600"
          placeholder="Rewrite it"
          aria-label="Edit message"
        />

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 items-center gap-1 rounded-full bg-white/[0.06] px-3 text-[12px] text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !value.trim()}
            className="flex h-8 items-center gap-1 rounded-full px-3.5 text-[12px] font-medium text-white disabled:opacity-50"
            style={{ background: "var(--brand-grad)" }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
