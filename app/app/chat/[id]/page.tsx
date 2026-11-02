"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Lock, MoreHorizontal, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { Avatar } from "@/components/avatar";
import { Composer } from "@/components/chat/composer";
import { MessageBubble } from "@/components/chat/message-bubble";
import { PresenceMoment } from "@/components/chat/presence-moment";
import { TypingBubble } from "@/components/chat/typing-bubble";
import { authMode } from "@/lib/auth";
import { demoConversations } from "@/lib/chat";
import { formatAgo, formatDuration, usePresence } from "@/lib/presence";
import { groupByDay, isGrouped, useThread } from "@/lib/thread";
import { cn } from "@/lib/utils";

function ThreadScreen() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const [conversation] = useState(
    () => demoConversations().find((c) => c.id === conversationId) ?? null
  );

  const partnerName = conversation?.name ?? "Them";
  const { messages, send, resetDemo } = useThread(conversationId);
  const { together, partner, togetherSince, lastSeenAt, iAmHere, setPresence } = usePresence({
    demo: authMode === "local",
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [, forceTick] = useState(0);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);

  // Keep the co-presence clock honest without re-rendering the world every frame.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Demo: the partner starts typing a beat after you send.
  useEffect(() => {
    if (messages.length === 0 || messages[messages.length - 1].author !== "me") return;
    setPresence("typing");
    const t = setTimeout(() => setPresence("here"), 2000);
    return () => clearTimeout(t);
  }, [messages.length, setPresence]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const first = lastCount.current === 0;
    lastCount.current = messages.length;
    bottom.current?.scrollIntoView({ behavior: first ? "auto" : "smooth", block: "end" });
  }, [messages.length]);

  const groups = groupByDay(messages);
  const awayLabel =
    !together && partner === "away"
      ? lastSeenAt
        ? `${partnerName} left ${formatAgo(lastSeenAt)} — your message will be waiting.`
        : `${partnerName} is away — your message will be waiting.`
      : undefined;

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden bg-ink">
      {/* The room warms up when you're both in it. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        animate={{ opacity: together ? 1 : 0.18 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      >
        <div className="absolute -right-28 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.32),transparent_68%)] blur-2xl" />
        <div className="absolute -left-24 top-1/3 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,90,255,0.14),transparent_70%)] blur-3xl" />
      </motion.div>

      <header className="relative z-20 border-b border-white/[0.05] bg-ink/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center gap-1.5 px-3 pb-2.5 pt-4 safe-t">
          <Link
            href="/app"
            aria-label="Back to chats"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Avatar
              avatarId={conversation?.avatarId ?? null}
              name={partnerName}
              size="sm"
              online={together}
            />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[15px] font-medium">{partnerName}</p>
              <PresenceLine
                together={together}
                typing={partner === "typing"}
                iAmHere={iAmHere}
                togetherSince={togetherSince}
                lastSeenAt={lastSeenAt}
                name={partnerName}
              />
            </div>
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Chat options"
              aria-expanded={menuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>

            <AnimatePresence>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-12 z-40 w-52 overflow-hidden rounded-xl2 border border-ink-line bg-[#16161B] shadow-card"
                  >
                    <Link
                      href="/settings"
                      className="flex items-center gap-2.5 px-4 py-3 text-[13.5px] text-text hover:bg-white/[0.04]"
                    >
                      <Settings2 className="h-4 w-4 text-text-muted" />
                      Chat settings
                    </Link>
                    {authMode === "local" && (
                      <button
                        type="button"
                        onClick={() => {
                          resetDemo();
                          setMenuOpen(false);
                          toast.success("Demo thread reset");
                        }}
                        className="flex w-full items-center gap-2.5 border-t border-ink-line px-4 py-3 text-left text-[13.5px] text-text hover:bg-white/[0.04]"
                      >
                        <RotateCcw className="h-4 w-4 text-text-muted" />
                        Reset demo thread
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* presence ribbon: only alive while you're both here */}
        <div className="relative mx-auto h-px w-full max-w-md overflow-hidden">
          <motion.div
            className="h-px w-full bg-gradient-to-r from-transparent via-rose to-transparent"
            animate={{ opacity: together ? 1 : 0, scaleX: together ? 1 : 0.2 }}
            transition={{ duration: 0.6 }}
          />
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-md px-4 pb-4 pt-2">
          <div className="flex flex-col items-center py-5 text-center">
            <span className="flex items-center gap-1 rounded-full border border-ink-line bg-ink-surface/60 px-2.5 py-1 text-[10.5px] text-text-muted">
              <Lock className="h-2.5 w-2.5" />
              Only you two can read this
            </span>
          </div>

          {groups.map((group) => (
            <section key={group.key}>
              <DayDivider label={group.label} />
              {group.items.map((message, i) => {
                const prev = group.items[i - 1];
                const next = group.items[i + 1];
                if (message.kind === "presence") {
                  return <PresenceMoment key={message.id} text={message.text} />;
                }
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    grouped={isGrouped(prev, message)}
                    tail={!next || !isGrouped(message, next)}
                  />
                );
              })}
            </section>
          ))}

          <AnimatePresence>
            {partner === "typing" && <TypingBubble name={partnerName} />}
          </AnimatePresence>

          <div ref={bottom} className="h-1" />
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md">
        <Composer
          onSend={send}
          placeholder={`Message ${partnerName}`}
          hint={
            awayLabel ? (
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-text-muted/50" />
                {awayLabel}
              </span>
            ) : undefined
          }
        />
      </div>
    </main>
  );
}

function PresenceLine({
  together,
  typing,
  iAmHere,
  togetherSince,
  lastSeenAt,
  name,
}: {
  together: boolean;
  typing: boolean;
  iAmHere: boolean;
  togetherSince: number | null;
  lastSeenAt: number | null;
  name: string;
}) {
  if (typing && together) {
    return (
      <p className="truncate text-[11.5px] font-medium text-rose/90" aria-live="polite">
        typing…
      </p>
    );
  }

  if (together) {
    const forMs = togetherSince ? Date.now() - togetherSince : 0;
    return (
      <p className="flex items-center gap-1.5 truncate text-[11.5px] text-success" aria-live="polite">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
        </span>
        You&apos;re both here
        {forMs > 20_000 && <span className="text-success/60">· {formatDuration(forMs)}</span>}
      </p>
    );
  }

  const label = lastSeenAt ? `Away · last here ${formatAgo(lastSeenAt)}` : "Away";
  return (
    <p className="truncate text-[11.5px] text-text-muted" aria-live="polite">
      {iAmHere ? label : "You stepped away"}
    </p>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-white/[0.06]" />
      <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[10.5px] uppercase tracking-[0.12em] text-text-muted/70">
        {label}
      </span>
      <span className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

export default function ThreadPage() {
  return (
    <AppGuard>
      <ThreadScreen />
    </AppGuard>
  );
}
