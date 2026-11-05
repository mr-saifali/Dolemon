"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ear } from "lucide-react";
import { whisperFor, type WhisperContext } from "@/lib/personal/core";

/**
 * A quiet, local read of a draft BEFORE it becomes a message. No model call,
 * no quota, no network — and it never sends anything itself.
 */
export function DraftWhisper({
  draft,
  context,
  onRewrite,
}: {
  draft: string;
  context: WhisperContext;
  onRewrite: (text: string) => void;
}) {
  const whisper = useMemo(() => whisperFor(draft, context), [draft, context]);
  const visible = draft.trim().length > 2 && Boolean(whisper.line);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.18 }}
          className="mx-auto mb-2 w-full max-w-2xl rounded-2xl border border-white/[0.06] bg-[#15151A]/95 px-3 py-2"
        >
          <div className="flex items-start gap-2.5">
            <Ear className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose/80" aria-hidden />
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-zinc-300">{whisper.line}</p>
            <span className="shrink-0 rounded-full bg-white/[0.05] px-2 py-0.5 text-[9.5px] uppercase tracking-wide text-zinc-500">
              local
            </span>
          </div>
          {whisper.rewrites.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
              {whisper.rewrites.map((rewrite) => (
                <button
                  key={rewrite.label}
                  type="button"
                  onClick={() => onRewrite(rewrite.text)}
                  className="rounded-full border border-rose/20 bg-rose/[0.08] px-2.5 py-1 text-[11px] text-rose/90 active:scale-95"
                >
                  {rewrite.label}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
