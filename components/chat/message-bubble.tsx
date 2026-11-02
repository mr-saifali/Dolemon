"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Check, CheckCheck, CornerUpLeft, Pause, Phone, PhoneMissed, Play, Video } from "lucide-react";
import type { ChatMessage, Reaction } from "@/lib/thread";
import { clockTime, formatCallDuration } from "@/lib/thread";
import { cn } from "@/lib/utils";

const EMOJI_ROW = ["❤️", "😌", "😂", "🥺", "🔥", "👍"];

export function MessageBubble({
  message,
  grouped,
  tail,
  onLongPress,
  onReact,
  showReceipts = true,
  onOpenImage,
}: {
  message: ChatMessage;
  grouped: boolean;
  tail: boolean;
  onLongPress: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  showReceipts?: boolean;
  onOpenImage?: (url: string) => void;
}) {
  const mine = message.author === "me";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress(message);
    }, 420);
  };
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancelPress, []);

  const reactions = message.reactions ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex w-full select-none", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2.5")}
      onContextMenu={(e) => {
        e.preventDefault();
        onLongPress(message);
      }}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
    >
      <div className={cn("flex max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "relative shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]",
            message.kind === "image" ? "p-1" : "px-3.5 py-2.5",
            message.kind === "audio" && "px-2.5 py-2",
            mine
              ? "rounded-[20px] rounded-br-[7px] bg-gradient-to-br from-[#FF5C7A] to-[#FF7E96] text-[#1A0A0F]"
              : "rounded-[20px] rounded-bl-[7px] border border-white/[0.05] bg-[#1F1F27] text-text/95"
          )}
        >
          {message.replyTo && (
            <div
              className={cn(
                "mb-1.5 flex items-start gap-1.5 rounded-lg border-l-2 px-2 py-1.5 text-[11.5px] leading-snug",
                mine ? "border-[#1A0A0F]/30 bg-black/10 text-[#1A0A0F]/80" : "border-rose/50 bg-white/[0.04] text-text-muted"
              )}
            >
              <CornerUpLeft className="mt-0.5 h-3 w-3 shrink-0 opacity-70" />
              <span className="line-clamp-2">
                <span className="font-medium">
                  {message.replyTo.author === "me" ? "You" : "Them"}:
                </span>{" "}
                {message.replyTo.text || "attachment"}
              </span>
            </div>
          )}

          {message.kind === "image" && message.media ? (
            <button
              type="button"
              onClick={() => onOpenImage?.(message.media!.url)}
              className="block overflow-hidden rounded-[16px]"
              aria-label="Open photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.media.url}
                alt="Shared photo"
                className="max-h-[280px] w-full max-w-[240px] object-cover"
              />
            </button>
          ) : message.kind === "audio" && message.media ? (
            <AudioBubble url={message.media.url} durationMs={message.media.durationMs ?? 0} mine={mine} />
          ) : (
            <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.35]">{message.text}</span>
          )}
        </div>

        {reactions.length > 0 && (
          <div className={cn("-mt-1.5 flex gap-1 px-1", mine ? "mr-1" : "ml-1")}>
            {reactions.map((r) => (
              <button
                key={`${r.by}-${r.emoji}`}
                type="button"
                onClick={() => onReact(message, r.emoji)}
                aria-label={`React ${r.emoji}`}
                className="flex h-[22px] items-center gap-0.5 rounded-full border border-white/[0.08] bg-[#22222A] px-1.5 text-[11px] shadow-sm"
              >
                <span>{r.emoji}</span>
                {reactions.filter((x) => x.emoji === r.emoji).length > 1 && (
                  <span className="text-[9.5px] text-text-muted">
                    {reactions.filter((x) => x.emoji === r.emoji).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {tail && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 px-1 text-[10.5px] tabular-nums",
              mine ? "text-text-muted/60" : "text-text-muted/50"
            )}
          >
            <span>{clockTime(message.at)}</span>
            {mine && showReceipts && <Receipt status={message.status} />}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Receipt({ status }: { status?: ChatMessage["status"] }) {
  if (status === "sending") return <AlertCircle className="h-3 w-3 opacity-60" aria-label="Sending" />;
  if (status === "sent") return <Check className="h-3 w-3" aria-label="Sent" />;
  return (
    <CheckCheck
      className={cn("h-3 w-3", status === "read" ? "text-success" : "opacity-60")}
      aria-label={status === "read" ? "Read" : "Delivered"}
    />
  );
}

function AudioBubble({ url, durationMs, mine }: { url: string; durationMs: number; mine: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const bars = Array.from({ length: 22 });

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
          mine ? "bg-[#1A0A0F]/20 text-[#1A0A0F]" : "bg-rose/15 text-rose"
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
              mine ? "bg-[#1A0A0F]/45" : "bg-rose/45",
              i / bars.length < progress && (mine ? "bg-[#1A0A0F]" : "bg-rose")
            )}
            style={{ height: 6 + ((i * 7) % 13) }}
          />
        ))}
      </div>
      <span className={cn("text-[10.5px] tabular-nums", mine ? "text-[#1A0A0F]/70" : "text-text-muted")}>
        {formatCallDuration(durationMs)}
      </span>
    </div>
  );
}

export function CallMoment({ message }: { message: ChatMessage }) {
  const missed = Boolean(message.call?.missed);
  const Icon = message.call?.type === "video" ? Video : missed ? PhoneMissed : Phone;

  return (
    <div className="my-3 flex justify-center">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px]",
          missed
            ? "border-danger/25 bg-danger/[0.07] text-danger/90"
            : "border-ink-line bg-ink-surface/70 text-text-muted"
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{message.text}</span>
        <span className="text-[10px] text-text-muted/50">{clockTime(message.at)}</span>
      </div>
    </div>
  );
}

export { EMOJI_ROW };
export type { Reaction };
