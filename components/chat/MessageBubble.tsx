"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, CheckCheck, Clock, CornerUpLeft, Pause, Play, RotateCw } from "lucide-react";
import { ReactionIcon } from "@/components/reactions";
import { ReactionChip } from "./ReactionChip";
import type { BubbleAnchor } from "./ReactionPicker";
import { buzz } from "@/lib/prefs";
import { reactionChips, reactionLabel, reactionSentence } from "@/lib/reactions";
import { clockTime, formatCallDuration, type ChatMessage } from "@/lib/thread";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

export function MessageBubble({
  message,
  grouped,
  tail,
  showReceipts = true,
  partnerName,
  onLongPress,
  onDoubleTap,
  onRemoveMyReaction,
  onRetry,
  onOpenImage,
}: {
  message: ChatMessage;
  /** same sender, inside the burst window → tighter gap */
  grouped: boolean;
  /** last message of the burst → time + ticks live here */
  tail: boolean;
  showReceipts?: boolean;
  partnerName: string;
  onLongPress: (message: ChatMessage, anchor: BubbleAnchor) => void;
  onDoubleTap: (message: ChatMessage) => void;
  onRemoveMyReaction: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenImage?: (url: string) => void;
}) {
  const mine = message.author === "me";
  const wrap = useRef<HTMLDivElement | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const lastTap = useRef(0);

  const [burst, setBurst] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [tooltip, setTooltip] = useState<string | null>(null);

  const chips = reactionChips(message.reactions);
  const failed = message.status === "failed";

  const clearTimer = () => {
    if (longTimer.current) clearTimeout(longTimer.current);
    longTimer.current = null;
  };

  const openPicker = () => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    onLongPress(message, { top: r.top, bottom: r.bottom, left: r.left, width: r.width });
  };

  const onPointerDown = () => {
    longFired.current = false;
    clearTimer();
    longTimer.current = setTimeout(() => {
      longFired.current = true;
      buzz(10);
      openPicker();
    }, 300);
  };

  const onPointerUp = () => clearTimer();

  const onClick = () => {
    if (longFired.current) {
      longFired.current = false;
      return;
    }
    if (failed) {
      onRetry(message);
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      buzz(10);
      setBurst((n) => n + 1);
      onDoubleTap(message);
      return;
    }
    lastTap.current = now;
  };

  // A sticker is a message with no words at all.
  if (message.kind === "sticker" && message.sticker) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING}
        className={cn("flex w-full", mine ? "justify-end" : "justify-start", grouped ? "mt-1.5" : "mt-3.5")}
      >
        <div className="flex flex-col gap-1" style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
          <ReactionIcon type={message.sticker} size={44} />
          <span className="px-1 text-[10px] tabular-nums text-[#8E8E93]/60">{clockTime(message.at)}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex w-full select-none",
        mine ? "justify-end" : "justify-start",
        grouped ? "mt-[6px]" : "mt-[14px]"
      )}
    >
      <div
        className={cn("relative flex max-w-[78%] flex-col", mine ? "items-end" : "items-start")}
        style={{ marginBottom: chips.length > 0 ? 8 : 0 }}
      >
        <div ref={wrap} className="relative">
          <div
            role="button"
            tabIndex={0}
            aria-label={`${mine ? "You" : partnerName}: ${message.text || "attachment"}. Long press for reactions.`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={clearTimer}
            onPointerCancel={clearTimer}
            onClick={onClick}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openPicker();
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              clearTimer();
              openPicker();
            }}
            className={cn(
              "relative cursor-default text-left outline-none focus-visible:ring-2 focus-visible:ring-rose/60",
              message.kind === "image" || message.kind === "audio" ? "p-1.5" : "px-4 py-3",
              "rounded-[20px]",
              mine
                ? "rounded-br-[6px] bg-[linear-gradient(135deg,#FF5C7A,#FF8FA3)] text-white"
                : "rounded-bl-[6px] bg-[#1E1E24] text-text"
            )}
          >
            {message.replyTo && (
              <div
                className={cn(
                  "mb-1.5 flex items-start gap-1.5 rounded-[10px] border-l-2 px-2 py-1.5 text-[11.5px] leading-snug",
                  mine
                    ? "border-white/40 bg-black/10 text-white/85"
                    : "border-rose/50 bg-white/[0.04] text-[#8E8E93]"
                )}
              >
                <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
                <span className="line-clamp-2">
                  <span className="font-medium">{message.replyTo.author === "me" ? "You" : partnerName}:</span>{" "}
                  {message.replyTo.text || "attachment"}
                </span>
              </div>
            )}

            {message.kind === "image" && message.media ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenImage?.(message.media!.url);
                }}
                className="block overflow-hidden rounded-[15px]"
                aria-label="Open photo"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={message.media.url}
                  alt="Shared photo"
                  className="max-h-[300px] w-full max-w-[248px] object-cover"
                />
              </button>
            ) : message.kind === "audio" && message.media ? (
              <AudioBubble url={message.media.url} durationMs={message.media.durationMs ?? 0} mine={mine} />
            ) : (
              <span className="block whitespace-pre-wrap break-words text-[15px] leading-[1.45]">
                {message.text}
              </span>
            )}

            {tail && (
              <span
                className={cn(
                  "float-right ml-2 mt-1 flex select-none items-center gap-1 text-[11px] leading-none",
                  mine ? "text-white/70" : "text-[#8E8E93]/80"
                )}
              >
                <span className="tabular-nums">{clockTime(message.at)}</span>
                {mine && showReceipts && <Ticks status={message.status} />}
              </span>
            )}

            <AnimatePresence>
              {burst > 0 && (
                <motion.span
                  key={burst}
                  aria-hidden
                  className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
                  initial={{ opacity: 0, scale: 0.6, y: 0 }}
                  animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1.05, 1.4, 1.4], y: [0, -16, -34, -40] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: "easeOut", times: [0, 0.25, 0.8, 1] }}
                  onAnimationComplete={() => setBurst(0)}
                >
                  <ReactionIcon type="dil" size={72} className="drop-shadow-[0_8px_18px_rgba(255,92,122,0.45)]" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {failed && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="absolute -left-7 bottom-1 flex h-6 w-6 items-center justify-center rounded-full text-danger"
              aria-label="Message failed — tap to retry"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <div
            className={cn(
              "-mt-2 flex flex-wrap items-center gap-1",
              mine ? "justify-end pr-2" : "justify-start pl-2"
            )}
          >
            <AnimatePresence initial={false}>
              {chips.map((chip) => (
                <ReactionChip
                  key={chip.type}
                  type={chip.type}
                  count={chip.count}
                  mine={chip.mine}
                  label={reactionLabel(chip.type)}
                  onTap={() => {
                    if (chip.mine) {
                      onRemoveMyReaction(message);
                      return;
                    }
                    setTooltip(reactionSentence(chip.type, partnerName, chip.count));
                    window.setTimeout(() => setTooltip(null), 2200);
                  }}
                  onLongPress={
                    chip.mine
                      ? () => {
                          setConfirmRemove(true);
                          window.setTimeout(() => setConfirmRemove(false), 2600);
                        }
                      : undefined
                  }
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {confirmRemove && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              onClick={() => {
                onRemoveMyReaction(message);
                setConfirmRemove(false);
              }}
              className={cn(
                "mt-1 rounded-full border border-white/[0.08] bg-[#232329] px-2.5 py-1 text-[11px] text-text",
                mine ? "self-end" : "self-start"
              )}
            >
              Remove reaction
            </motion.button>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {tooltip && (
            <motion.span
              role="status"
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              className={cn(
                "mt-1 rounded-full border border-white/[0.08] bg-[#232329] px-2.5 py-1 text-[11px] text-[#F5F5F7]",
                mine ? "self-end" : "self-start"
              )}
            >
              {tooltip}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Ticks({ status }: { status?: ChatMessage["status"] }) {
  if (status === "failed") return <AlertCircle className="h-[11px] w-[11px] text-red-300" aria-label="Not sent" />;
  if (status === "sending" || !status)
    return <Clock className="h-[11px] w-[11px] opacity-60" aria-label="Sending" />;
  if (status === "sent") return <Check className="h-[13px] w-[13px]" aria-label="Sent" />;
  if (status === "delivered")
    return <CheckCheck className="h-[13px] w-[13px] text-white/75" aria-label="Delivered" />;
  return (
    <CheckCheck
      className="h-[13px] w-[13px] text-white drop-shadow-[0_0_5px_rgba(255,92,122,0.9)]"
      aria-label="Read"
    />
  );
}

function AudioBubble({ url, durationMs, mine }: { url: string; durationMs: number; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = Array.from({ length: 22 });

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      void el.play();
      setPlaying(true);
    }
  };

  return (
    <div className="flex min-w-[190px] items-center gap-2.5 py-1">
      <audio
        ref={audio}
        src={url}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setProgress(el.duration ? el.currentTime / el.duration : 0);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        preload="metadata"
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          mine ? "bg-black/15 text-white" : "bg-rose/15 text-rose"
        )}
      >
        {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
      </button>
      <div className="flex flex-1 items-center gap-[2px]" aria-hidden>
        {bars.map((_, i) => (
          <span
            key={i}
            className={cn(
              "w-[2px] rounded-full",
              mine ? "bg-white/40" : "bg-rose/40",
              i / bars.length < progress && (mine ? "bg-white" : "bg-rose")
            )}
            style={{ height: 6 + ((i * 7) % 13) }}
          />
        ))}
      </div>
      <span className={cn("text-[10.5px] tabular-nums", mine ? "text-white/75" : "text-[#8E8E93]")}>
        {formatCallDuration(durationMs)}
      </span>
    </div>
  );
}
