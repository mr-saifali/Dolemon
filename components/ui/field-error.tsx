"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

export function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="mt-2 flex items-center gap-1.5 text-[13px] text-danger"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{message}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}
