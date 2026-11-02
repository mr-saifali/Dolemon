"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Lock,
  MoreHorizontal,
  Phone,
  PhoneIncoming,
  RotateCcw,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { Avatar } from "@/components/avatar";
import { AttachmentSheet } from "@/components/chat/attachment-sheet";
import { Composer } from "@/components/chat/composer";
import { MessageActions } from "@/components/chat/message-actions";
import { CallMoment, MessageBubble } from "@/components/chat/message-bubble";
import { PresenceMoment } from "@/components/chat/presence-moment";
import { PulseOverlay } from "@/components/chat/pulse-overlay";
import { TypingBubble } from "@/components/chat/typing-bubble";
import { authMode } from "@/lib/auth";
import { demoConversations } from "@/lib/chat";
import { markRead, useChatMeta } from "@/lib/conversation-meta";
import { formatAgo, formatDuration, usePresence } from "@/lib/presence";
import { buzz, usePrefs } from "@/lib/prefs";
import { usePulses } from "@/lib/pulses";
import {
  groupByDay,
  isGrouped,
  previewFor,
  useThread,
  type ChatMessage,
  type QuotedMessage,
} from "@/lib/thread";
import { cn } from "@/lib/utils";

function ThreadScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;
  const [conversation] = useState(
    () => demoConversations().find((c) => c.id === conversationId) ?? null
  );

  const partnerName = conversation?.name ?? "Them";
  const prefs = usePrefs();
  const { messages, send, react, remove, addMoment, resetDemo, ready } = useThread(conversationId);
  const { together, partner, togetherSince, lastSeenAt, iAmHere, setPresence } = usePresence({
    demo: authMode === "local",
    logKey: conversationId,
  });
  const meta = useChatMeta();

  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMessage, setActiveMessage] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<QuotedMessage | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [dividerId, setDividerId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const bottom = useRef<HTMLDivElement | null>(null);
  const lastCount = useRef(0);
  const marked = useRef(false);

  const pulses = usePulses({
    demo: authMode === "local",
    onIncoming: () => {
      if (prefs.haptics) buzz(14);
    },
    onMutual: () => {
      const time = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      addMoment(`You both reached for each other at ${time} — pulses crossing in the same minute`);
      toast.success("You both reached for each other", { description: "Saved to your presence moments." });
    },
  });

  const handlePulse = () => {
    const result = pulses.send();
    if (result === "disabled") {
      toast.error("Pulses are off", { description: "Turn them on in Settings → Presence." });
    } else if (result === "sent" && prefs.haptics) {
      buzz(8);
    }
  };

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

  // Work out where "new messages" begins, then clear the badge for this chat.
  useEffect(() => {
    if (!ready || marked.current) return;
    marked.current = true;
    const lastRead = meta[conversationId]?.lastReadAt ?? 0;
    const firstUnread = messages.find((m) => m.at > lastRead && m.author !== "me");
    if (firstUnread && messages.indexOf(firstUnread) > 0) setDividerId(firstUnread.id);
    markRead(conversationId);
  }, [ready, conversationId, messages, meta]);

  useEffect(() => {
    const first = lastCount.current === 0;
    lastCount.current = messages.length;
    bottom.current?.scrollIntoView({ behavior: first ? "auto" : "smooth", block: "end" });
  }, [messages.length]);

  const groups = useMemo(() => groupByDay(messages), [messages]);
  const indexById = useMemo(
    () => new Map(messages.map((m, i) => [m.id, i] as const)),
    [messages]
  );

  const awayLabel =
    !together && partner === "away"
      ? lastSeenAt
        ? `${partnerName} left ${formatAgo(lastSeenAt)} — your message will be waiting.`
        : `${partnerName} is away — your message will be waiting.`
      : undefined;

  const startCall = (kind: "voice" | "video") => {
    router.push(`/app/call/${conversationId}?kind=${kind}&direction=outgoing`);
  };

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden bg-ink">
      <PulseOverlay
        burst={pulses.burst}
        incoming={Boolean(pulses.incoming)}
        incomingText={pulses.incoming ? `${partnerName} is thinking of you` : null}
      />

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
        <div className="mx-auto flex w-full max-w-md items-center gap-1 px-3 pb-2.5 pt-4 safe-t">
          <Link
            href="/app"
            aria-label="Back to chats"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>

          <Link
            href={`/app/room/${conversationId}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-0.5 transition-colors hover:bg-white/[0.03]"
          >
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
                typing={partner === "typing" && prefs.typingIndicator}
                iAmHere={iAmHere}
                visible={prefs.showPresence}
                togetherSince={togetherSince}
                lastSeenAt={lastSeenAt}
                name={partnerName}
              />
            </div>
          </Link>

          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => startCall("voice")}
              aria-label="Voice call"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
            >
              <Phone className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => startCall("video")}
              aria-label="Video call"
              className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text"
            >
              <Video className="h-[18px] w-[18px]" />
            </button>

            <div className="relative">
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
                      className="absolute right-0 top-12 z-40 w-56 overflow-hidden rounded-xl2 border border-ink-line bg-[#16161B] shadow-card"
                    >
                      <MenuLink href={`/app/room/${conversationId}`} icon={<Sparkles className="h-4 w-4" />}>
                        Your room
                      </MenuLink>
                      {authMode === "local" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              router.push(`/app/call/${conversationId}?kind=voice&direction=incoming`);
                            }}
                            className="flex w-full items-center gap-2.5 border-t border-ink-line px-4 py-3 text-left text-[13.5px] text-text hover:bg-white/[0.04]"
                          >
                            <PhoneIncoming className="h-4 w-4 text-text-muted" />
                            Simulate incoming call
                          </button>
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
                        </>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

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
                      onLongPress={setActiveMessage}
                      onReact={(m, emoji) => react(m.id, emoji, "me")}
                      showReceipts={prefs.readReceipts}
                      onOpenImage={setViewerUrl}
                    />
                  </div>
                );
              })}
            </section>
          ))}

          <AnimatePresence>
            {partner === "typing" && prefs.typingIndicator && <TypingBubble name={partnerName} />}
          </AnimatePresence>

          <div ref={bottom} className="h-1" />
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md">
        <Composer
          onSend={(text) => {
            send(text, replyTo ? { replyTo } : {});
            setReplyTo(null);
          }}
          onPulse={handlePulse}
          onAttach={() => setAttachOpen(true)}
          pulseCoolingUntil={pulses.coolingUntil}
          pulseDisabled={!prefs.allowPulses}
          placeholder={`Message ${partnerName}`}
          replyTo={
            replyTo
              ? { author: replyTo.author === "me" ? "You" : partnerName, text: replyTo.text }
              : null
          }
          onCancelReply={() => setReplyTo(null)}
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

      <MessageActions
        message={activeMessage}
        onClose={() => setActiveMessage(null)}
        onReply={(m) => setReplyTo({ id: m.id, author: m.author, text: previewFor(m) })}
        onReact={(m, emoji) => react(m.id, emoji, "me")}
        onDelete={(m) => remove(m.id)}
      />

      <AttachmentSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPhoto={(image) =>
          send(`Photo · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`, {
            kind: "image",
            media: { url: image.dataUrl, width: image.width, height: image.height },
          })
        }
        onVoice={(audio) =>
          send("Voice note", { kind: "audio", media: { url: audio.dataUrl, durationMs: audio.durationMs } })
        }
      />

      <AnimatePresence>
        {viewerUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4"
          >
            <button
              type="button"
              onClick={() => setViewerUrl(null)}
              aria-label="Close photo"
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewerUrl} alt="Shared photo" className="max-h-full max-w-full rounded-xl object-contain" />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function MenuLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-4 py-3 text-[13.5px] text-text hover:bg-white/[0.04]"
    >
      <span className="text-text-muted">{icon}</span>
      {children}
    </Link>
  );
}

function UnreadDivider() {
  return (
    <div className="my-3 flex items-center gap-3" role="separator" aria-label="New messages">
      <span className="h-px flex-1 bg-rose/25" />
      <span className="rounded-full bg-rose/12 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-rose">
        New
      </span>
      <span className="h-px flex-1 bg-rose/25" />
    </div>
  );
}

function PresenceLine({
  together,
  typing,
  iAmHere,
  visible,
  togetherSince,
  lastSeenAt,
  name,
}: {
  together: boolean;
  typing: boolean;
  iAmHere: boolean;
  visible: boolean;
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

  if (!visible) {
    return (
      <p className="truncate text-[11.5px] text-text-muted">
        You&apos;re invisible · {name} can&apos;t see you
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
