"use client";

import { Sparkles, Undo2 } from "lucide-react";
import type { Learning } from "@/lib/personal/core";

/** Every adaptation must explain itself and be one tap away from being undone. */
export function LearningsBar({ learning, onUndo }: { learning: Learning; onUndo: (id: string) => void }) {
  return (
    <div className="mx-auto mb-1.5 flex w-full max-w-2xl items-start gap-2.5 rounded-2xl border border-violet/20 bg-violet/[0.07] px-3 py-2">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-soft" aria-hidden />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[12px] font-medium text-zinc-200">{learning.title}</p>
        <p className="mt-0.5 text-[11px] text-zinc-500">{learning.why} {learning.action}</p>
      </div>
      <button
        type="button"
        onClick={() => onUndo(learning.id)}
        className="flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] text-zinc-300 active:scale-95"
      >
        <Undo2 className="h-3 w-3" /> Undo
      </button>
    </div>
  );
}
