"use client";

import { motion } from "framer-motion";
import { AlertCircle, Check, CheckCheck } from "lucide-react";
import type { ChatMessage } from "@/lib/thread";
import { clockTime } from "@/lib/thread";
import { cn } from "@/lib/utils";

export function MessageBubble({
  message,
  grouped,
  tail,
}: {
  message: ChatMessage;
  /** follows a message from the same author within a few minutes */
  grouped: boolean;
  /** last bubble of its group — carries the time + receipt */
  tail: boolean;
}) {
  const mine = message.author === "me";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex w-full", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2.5")}
    >
      <div className={cn("flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-3.5 py-2.5 text-[15px] leading-[1.35] shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
            mine
              ? "rounded-[20px] rounded-br-[7px] bg-gradient-to-br from-[#FF5C7A] to-[#FF7E96] text-[#1A0A0F]"
              : "rounded-[20px] rounded-bl-[7px] border border-white/[0.05] bg-[#1F1F27] text-text/95"
          )}
        >
          <span className="whitespace-pre-wrap break-words">{message.text}</span>
        </div>

        {tail && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 px-1 text-[10.5px] tabular-nums",
              mine ? "text-text-muted/60" : "text-text-muted/50"
            )}
          >
            <span>{clockTime(message.at)}</span>
            {mine && <Receipt status={message.status} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Receipt({ status }: { status?: ChatMessage["status"] }) {
  if (status === "sending") {
    return <AlertCircle className="h-3 w-3 opacity-60" aria-label="Sending" />;
  }
  if (status === "sent") {
    return <Check className="h-3 w-3" aria-label="Sent" />;
  }
  return (
    <CheckCheck
      className={cn("h-3 w-3", status === "read" ? "text-success" : "opacity-60")}
      aria-label={status === "read" ? "Read" : "Delivered"}
    />
  );
}
