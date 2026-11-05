"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, CheckCheck, Clock, CornerUpLeft, Download, FileText, Pause, Play, RotateCw } from "lucide-react";
import { ReactionIcon } from "@/components/reactions";
import { ReactionChip } from "./ReactionChip";
import type { BubbleAnchor } from "./ReactionPicker";
import { buzz } from "@/lib/prefs";
import { reactionChips, reactionLabel, reactionSentence } from "@/lib/reactions";
import { clockTime, formatBytes, formatCallDuration, type ChatMessage } from "@/lib/thread";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 400, damping: 30 } as const;

export function MessageBubble({
  message,
  grouped,
  showReceipts = true,
  partnerName,
  onLongPress,
  onDoubleTap,
  onRemoveMyReaction,
  onRetry,
  onOpenImage,
  onSwipeReply,
  animateIn = true,
  compact = false,
}: {
  message: ChatMessage;
  /** same sender, inside the burst window → tighter gap */
  grouped: boolean;
  /** Kept for grouping compatibility with the message list. */
  tail: boolean;
  showReceipts?: boolean;
  partnerName: string;
  onLongPress: (message: ChatMessage, anchor: BubbleAnchor) => void;
  onDoubleTap: (message: ChatMessage) => void;
  onRemoveMyReaction: (message: ChatMessage) => void;
  onRetry: (message: ChatMessage) => void;
  onOpenImage?: (url: string) => void;
  /** swiping a bubble to the right quotes it */
  onSwipeReply?: (message: ChatMessage) => void;
  /** false for messages that were already on screen at mount — they must not animate in */
  animateIn?: boolean;
  /** tighter spacing between bubbles */
  compact?: boolean;
}) {
  const mine = message.author === "me";
  const wrap = useRef<HTMLDivElement | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const lastTap = useRef(0);

  const [burst, setBurst] = useState(0);
  const [swipe, setSwipe] = useState(0);
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

  // A sticker is a message with no words at all — the time sits beside the face, never under it.
  if (message.kind === "sticker" && message.sticker) {
    const enter = animateIn === false ? false : { opacity: 0, y: 10, x: mine ? 10 : -10, scale: 0.9 };

    return (
      <motion.div
        initial={enter}
        animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
        transition={SPRING}
        className={cn(
          "flex w-full",
          mine ? "justify-end" : "justify-start",
          grouped ? (compact ? "mt-[2px]" : "mt-1") : compact ? "mt-2" : "mt-4"
        )}
      >
        <div className={cn("flex items-end gap-1.5", mine ? "flex-row-reverse" : "flex-row")}>
          <span className="flex items-center gap-1 pb-0.5 text-[10px] leading-none tabular-nums text-zinc-600">
            {clockTime(message.at)}
            {mine && showReceipts && <Ticks status={message.status} seenAt={message.seenAt} />}
          </span>
          <ReactionIcon type={message.sticker} size={44} />
        </div>
      </motion.div>
    );
  }

  const metaColor = mine ? "text-white/60" : "text-zinc-400";

  return (
    <motion.div
      initial={animateIn === false ? false : { opacity: 0, y: 10, x: mine ? 10 : -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
      className={cn(
        "flex w-full select-none",
        mine ? "justify-end" : "justify-start",
        grouped ? (compact ? "mt-[2px]" : "mt-1") : compact ? "mt-2" : "mt-4"
      )}
    >
      <div
        className={cn("relative flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}
        style={{ marginBottom: chips.length > 0 ? 10 : 0 }}
      >
        {onSwipeReply && (
          <motion.span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-zinc-500",
              mine ? "right-full mr-2" : "left-full ml-2"
            )}
            animate={{ opacity: Math.min(1, swipe / 50), scale: 0.8 + Math.min(0.2, swipe / 300) }}
            transition={{ duration: 0.1 }}
          >
            <CornerUpLeft className="h-4 w-4" />
          </motion.span>
        )}

        <motion.div
          ref={wrap}
          drag={onSwipeReply ? "x" : false}
          dragDirectionLock
          dragConstraints={{ left: 0, right: 92 }}
          dragElastic={0.14}
          dragSnapToOrigin
          onDragStart={() => clearTimer()}
          onDrag={(_, info) => setSwipe(Math.max(0, info.offset.x))}
          onDragEnd={(_, info) => {
            setSwipe(0);
            if (info.offset.x > 54) {
              buzz(12);
              onSwipeReply?.(message);
            }
          }}
          style={{ touchAction: "pan-y" }}
          className="relative"
        >
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
              "relative cursor-default text-left outline-none focus-visible:ring-2 focus-visible:ring-violet/50",
              message.kind === "image" || message.kind === "audio"
                ? "p-1.5"
                : message.kind === "file"
                  ? "px-4 py-3"
                  : "px-4 py-2.5",
              "rounded-[22px]",
              mine ? "bg-[#FF5C7A] text-white" : "bg-[#262628] text-zinc-100"
            )}
          >
            {message.replyTo && (
              <div
                className={cn(
                  "mb-1.5 flex items-start gap-1.5 rounded-[12px] px-2 py-1.5 text-[11.5px] leading-snug",
                  mine
                    ? "bg-black/10 text-white/85"
                    : "bg-white/[0.06] text-zinc-400"
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
              <div>
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
                <BubbleMeta message={message} mine={mine} showReceipts={showReceipts} metaColor={metaColor} />
              </div>
            ) : message.kind === "file" && message.media ? (
              <div>
                <a
                  href={message.media.url}
                  target="_blank"
                  rel="noreferrer"
                  download={message.media.name}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-3 py-1"
                  aria-label={`Download ${message.media.name || "file"}`}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      mine ? "bg-black/15" : "bg-rose/15"
                    )}
                  >
                    <FileText className={cn("h-[18px] w-[18px]", mine ? "text-white" : "text-rose")} />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[14px]">{message.media.name || "File"}</span>
                    {message.media.sizeBytes ? (
                      <span className={cn("block text-[11px]", mine ? "text-white/60" : "text-zinc-500")}>
                        {formatBytes(message.media.sizeBytes)}
                      </span>
                    ) : null}
                  </span>
                  <Download className={cn("h-[18px] w-[18px] shrink-0", mine ? "text-white/70" : "text-zinc-500")} />
                </a>
                <BubbleMeta message={message} mine={mine} showReceipts={showReceipts} metaColor={metaColor} />
              </div>
            ) : message.kind === "audio" && message.media ? (
              <div>
                <AudioBubble url={message.media.url} durationMs={message.media.durationMs ?? 0} mine={mine} />
                <BubbleMeta message={message} mine={mine} showReceipts={showReceipts} metaColor={metaColor} />
              </div>
            ) : (
              <>
                <span className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                  {message.text}
                </span>
                <BubbleMeta message={message} mine={mine} showReceipts={showReceipts} metaColor={metaColor} />
              </>
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
        </motion.div>

        {/* Reaction chips hug the bubble's bottom corner, overlapping it slightly. */}
        {chips.length > 0 && (
          <div className={cn("absolute -bottom-2 z-10 flex items-center gap-1", mine ? "right-2" : "left-2")}>
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
                          setTooltip("Tap to remove your reaction");
                          window.setTimeout(() => setTooltip(null), 1800);
                        }
                      : undefined
                  }
                />
              ))}
            </AnimatePresence>

            <AnimatePresence>
              {tooltip && (
                <motion.span
                  role="status"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 3 }}
                  className={cn(
                    "absolute bottom-full mb-1.5 whitespace-nowrap rounded-full border border-white/10 bg-[#1C1C1E] px-2.5 py-1 text-[11px] text-zinc-200 shadow-sm",
                    mine ? "right-0" : "left-0"
                  )}
                >
                  {tooltip}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** The quiet time + ticks line for photos / voice notes, kept inside the bubble. */
function BubbleMeta({
  message,
  mine,
  showReceipts,
  metaColor,
}: {
  message: ChatMessage;
  mine: boolean;
  showReceipts: boolean;
  metaColor: string;
}) {
  return (
    <span className={cn("mt-1.5 flex items-center justify-end gap-1 text-[10px] leading-none", metaColor)}>
      <span className="tabular-nums">{clockTime(message.at)}</span>
      {message.editedAt ? <span className="italic">edited</span> : null}
      {mine && showReceipts && <Ticks status={message.status} seenAt={message.seenAt} />}
    </span>
  );
}

/**
 * The tick ladder: one tick = delivered, two ticks (accent) = seen.
 * When we know the exact read moment it's shown right after.
 */
function Ticks({ status, seenAt }: { status?: ChatMessage["status"]; seenAt?: number | null }) {
  if (status === "failed") return <AlertCircle className="h-3 w-3 text-red-300" aria-label="Not sent" />;
  if (status === "sending" || !status) return <Clock className="h-3 w-3 text-white/40" aria-label="Sending" />;
  if (status === "read") {
    return <CheckCheck className="h-3 w-3 text-white/60" aria-label={seenAt ? `Seen at ${clockTime(seenAt)}` : "Seen"} />;
  }
  // "sent" (the brief demo beat) and "delivered" both read as: one tick
  return <Check className="h-3 w-3 text-white/60" aria-label="Delivered" />;
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
