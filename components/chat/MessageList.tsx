"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Phone, PhoneMissed, Video } from "lucide-react";
import { SystemPill } from "./SystemPill";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { PresenceMoment } from "./presence-moment";
import type { BubbleAnchor } from "./ReactionPicker";
import { groupByDay, isGrouped, clockTime, type ChatMessage } from "@/lib/thread";
import { cn } from "@/lib/utils";

export function MessageList({
  messages,
  partnerName,
  typing,
  showReceipts,
  dividerId,
  compact = false,
  onLongPress,
  onDoubleTap,
  onRemoveMyReaction,
  onRetry,
  onOpenImage,
  onSwipeReply,
}: {
  messages: ChatMessage[];
  partnerName: string;
  typing: boolean;
  showReceipts: boolean;
  dividerId: string | null;
  /** tighter bubbles — set from Settings → Feel */
  compact?: boolean;
  onLongPress: (message: ChatMessage, anchor: BubbleAnchor) => void;
  onDoubleTap: (message: ChatMessage) => void;
  onRemoveMyReaction: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenImage?: (url: string) => void;
  onSwipeReply?: (message: ChatMessage) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const previousCount = useRef(0);
  /** whatever was already on screen when the thread opened stays still — no hundred springs */
  const initialIds = useRef<Set<string> | null>(null);
  if (initialIds.current === null) initialIds.current = new Set(messages.map((m) => m.id));
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);

  const groups = useMemo(() => groupByDay(messages), [messages]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setNewCount(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distance < 120;
    setAtBottom(near);
    if (near) setNewCount(0);
  }, []);

  // Pin to the newest message only when the reader is already near the bottom.
  useEffect(() => {
    const grew = messages.length > previousCount.current;
    const added = messages.length - previousCount.current;
    const first = previousCount.current === 0;
    previousCount.current = messages.length;
    if (!grew) return;
    if (first || atBottom) {
      requestAnimationFrame(() => scrollToBottom(first ? "auto" : "smooth"));
    } else {
      setNewCount((n) => n + added);
    }
  }, [messages.length, atBottom, scrollToBottom]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scroller}
        onScroll={handleScroll}
        className="h-full overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-4">
          <div className="mb-1 flex justify-center">
            <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">
              Sirf tum dono ke liye
            </span>
          </div>

          {groups.map((group) => (
            <section key={group.key}>
              <SystemPill>{group.label}</SystemPill>
              {group.items.map((message, i) => {
                const prev = group.items[i - 1];
                const next = group.items[i + 1];
                const showDivider = dividerId === message.id;

                if (message.kind === "presence") {
                  return (
                    <div key={message.id}>
                      {showDivider && <UnreadDivider />}
                      <PresenceMoment text={message.text} />
                    </div>
                  );
                }

                if (message.kind === "call") {
                  return (
                    <div key={message.id}>
                      {showDivider && <UnreadDivider />}
                      <CallMoment message={message} />
                    </div>
                  );
                }

                return (
                  <div key={message.id}>
                    {showDivider && <UnreadDivider />}
                    <MessageBubble
                      message={message}
                      grouped={isGrouped(prev, message)}
                      tail={!next || !isGrouped(message, next)}
                      showReceipts={showReceipts}
                      partnerName={partnerName}
                      onLongPress={onLongPress}
                      onDoubleTap={onDoubleTap}
                      onRemoveMyReaction={onRemoveMyReaction}
                      onRetry={onRetry}
                      onOpenImage={onOpenImage}
                      onSwipeReply={onSwipeReply}
                      animateIn={!initialIds.current?.has(message.id)}
                      compact={compact}
                    />
                  </div>
                );
              })}
            </section>
          ))}

          <TypingIndicator active={typing} />
          <div className="h-1" />
        </div>
      </div>

      <AnimatePresence>
        {newCount > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.08] bg-[#232329] px-3 py-1.5 text-[12px] text-text shadow-[0_14px_30px_-10px_rgba(0,0,0,0.85)]"
            aria-label={`${newCount} new messages — jump to latest`}
          >
            <ArrowDown className="h-3.5 w-3.5 text-rose" />
            {newCount} naya
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

function UnreadDivider() {
  return (
    <div className="my-4 flex items-center gap-3" role="separator" aria-label="New messages">
      <span className="h-px flex-1 bg-rose/20" />
      <span className="rounded-full bg-rose/[0.12] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-rose">
        New
      </span>
      <span className="h-px flex-1 bg-rose/20" />
    </div>
  );
}

export function CallMoment({ message }: { message: ChatMessage }) {
  const missed = Boolean(message.call?.missed);
  const Icon = message.call?.type === "video" ? Video : missed ? PhoneMissed : Phone;
  const label = message.text.replace(" · ", " - ");

  return (
    <SystemPill
      icon={<Icon className={cn("h-3 w-3 shrink-0", missed ? "text-[#FF8FA3]" : "text-zinc-500")} strokeWidth={1.8} />}
    >
      {label} · {clockTime(message.at)}
    </SystemPill>
  );
}
