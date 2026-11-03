"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/**
 * One honest confirmation, the way a serious app asks before something
 * irreversible: a dimmed room, a centred card, a clear danger button.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="absolute inset-0 bg-black/70"
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="relative w-full max-w-xs rounded-[22px] border border-white/[0.08] bg-[#15151A] p-5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)]"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FF5C7A]/12 text-[#FF8FA3]">
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[15.5px] font-medium leading-snug text-zinc-100">{title}</h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">{description}</p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 rounded-full bg-white/[0.06] py-2.5 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.09]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="flex-1 rounded-full bg-[linear-gradient(165deg,#FF5C7A_0%,#E14463_100%)] py-2.5 text-[13px] font-medium text-white shadow-[0_8px_20px_-8px_rgba(255,92,122,0.7)] transition-opacity disabled:opacity-50"
              >
                {busy ? "Working…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
