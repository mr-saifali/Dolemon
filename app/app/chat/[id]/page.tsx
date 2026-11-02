"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BellOff,
  PhoneIncoming,
  RotateCcw,
  ShieldOff,
  Sparkles,
  Trash2,
  Video,
  Phone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { AttachmentSheet } from "@/components/chat/attachment-sheet";
import { ChatInput } from "@/components/chat/ChatInput";
import { ChatHeader, ChatMenuSheet, type ChatMenuAction } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { PulseOverlay } from "@/components/chat/pulse-overlay";
import { ReactionPicker, type BubbleAnchor, type MessageAction } from "@/components/chat/ReactionPicker";
import { authMode } from "@/lib/auth";
import { demoConversations } from "@/lib/chat";
import { markRead, patchMeta, useChatMetaFor } from "@/lib/conversation-meta";
import { formatAgo, usePresence } from "@/lib/presence";
import { buzz, usePrefs } from "@/lib/prefs";
import { usePulses } from "@/lib/pulses";
import { QUICK_REACTION, type ReactionType } from "@/lib/reactions";
import { previewFor, useThread, type ChatMessage, type QuotedMessage } from "@/lib/thread";
import { useViewportHeight } from "@/lib/use-viewport-height";

function ThreadScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;
  const [conversation] = useState(
    () => demoConversations().find((c) => c.id === conversationId) ?? null
  );

  const partnerName = conversation?.name ?? "Them";
  const prefs = usePrefs();
  const meta = useChatMetaFor(conversationId);
  const { messages, send, react, clearMyReaction, retry, remove, clear, addMoment, resetDemo, ready } =
    useThread(conversationId);
  const { together, partner, lastSeenAt, setPresence } = usePresence({
    demo: authMode === "local",
    logKey: conversationId,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<{ message: ChatMessage; anchor: BubbleAnchor } | null>(null);
  const [replyTo, setReplyTo] = useState<QuotedMessage | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [dividerId, setDividerId] = useState<string | null>(null);
  const marked = useRef(false);

  useViewportHeight();

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

  // Demo: the partner starts typing a beat after you send.
  useEffect(() => {
    if (messages.length === 0 || messages[messages.length - 1].author !== "me") return;
    setPresence("typing");
    const t = setTimeout(() => setPresence("here"), 2000);
    return () => clearTimeout(t);
    // keyed on length on purpose — the thread array identity changes on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, setPresence]);

  // Work out where "new messages" begins, then clear the badge for this chat.
  useEffect(() => {
    if (!ready || marked.current) return;
    marked.current = true;
    const lastRead = meta.lastReadAt ?? 0;
    const firstUnread = messages.find((m) => m.at > lastRead && m.author !== "me");
    if (firstUnread && messages.indexOf(firstUnread) > 0) setDividerId(firstUnread.id);
    markRead(conversationId);
    // deliberately once per mount: re-running would clear the divider we just set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, conversationId]);

  const status = useMemo(() => {
    if (together) return "online";
    if (lastSeenAt) return `last seen ${formatAgo(lastSeenAt)}`;
    return "offline";
  }, [together, lastSeenAt]);

  const handlePulse = useCallback(() => {
    const result = pulses.send();
    if (result === "disabled") {
      toast.error("Pulses are off", { description: "Turn them on in Settings → Presence." });
    } else if (result === "sent" && prefs.haptics) {
      buzz(8);
    }
  }, [pulses, prefs.haptics]);

  const handleSend = (text: string) => {
    send(text, replyTo ? { replyTo } : {});
    setReplyTo(null);
  };

  const handleSticker = (type: ReactionType) => {
    send("", { kind: "sticker", sticker: type });
  };

  const handleDoubleTap = (message: ChatMessage) => {
    react(message.id, QUICK_REACTION);
  };

  const runAction = (action: MessageAction, message: ChatMessage) => {
    switch (action) {
      case "reply":
        setReplyTo({ id: message.id, author: message.author, text: previewFor(message) });
        break;
      case "copy": {
        const text = previewFor(message);
        navigator.clipboard?.writeText(text).then(
          () => toast.success("Copied"),
          () => toast.error("Couldn't copy")
        );
        break;
      }
      case "forward":
        toast("Forward", { description: "Forwarding to another chat arrives with multi-chat threads." });
        break;
      case "delete":
        remove(message.id);
        toast.success("Message deleted");
        break;
    }
    setPicker(null);
  };

  const menuActions: ChatMenuAction[] = [
    {
      key: "voice",
      label: "Voice call",
      icon: <Phone className="h-[18px] w-[18px]" />,
      onSelect: () => router.push(`/app/call/${conversationId}?kind=voice&direction=outgoing`),
    },
    {
      key: "video",
      label: "Video call",
      icon: <Video className="h-[18px] w-[18px]" />,
      onSelect: () => router.push(`/app/call/${conversationId}?kind=video&direction=outgoing`),
    },
    {
      key: "room",
      label: "Your room",
      hint: "presence",
      icon: <Sparkles className="h-[18px] w-[18px]" />,
      onSelect: () => router.push(`/app/room/${conversationId}`),
    },
    {
      key: "mute",
      label: meta.muted ? "Unmute notifications" : "Mute notifications",
      icon: <BellOff className="h-[18px] w-[18px]" />,
      active: Boolean(meta.muted),
      onSelect: () => {
        patchMeta(conversationId, { muted: !meta.muted });
        toast.success(meta.muted ? "Notifications on" : "Notifications muted");
      },
    },
    {
      key: "clear",
      label: "Clear chat",
      icon: <Trash2 className="h-[18px] w-[18px]" />,
      onSelect: () => {
        clear();
        toast.success("Chat cleared");
      },
    },
    {
      key: "block",
      label: meta.blocked ? "Unblock" : "Block",
      icon: <ShieldOff className="h-[18px] w-[18px]" />,
      danger: !meta.blocked,
      onSelect: () => {
        patchMeta(conversationId, { blocked: !meta.blocked });
        toast.success(meta.blocked ? "Unblocked" : `Blocked ${partnerName}`);
      },
    },
    ...(authMode === "local"
      ? [
          {
            key: "incoming",
            label: "Simulate incoming call",
            icon: <PhoneIncoming className="h-[18px] w-[18px]" />,
            onSelect: () =>
              router.push(`/app/call/${conversationId}?kind=voice&direction=incoming`),
          },
          {
            key: "reset",
            label: "Reset demo thread",
            icon: <RotateCcw className="h-[18px] w-[18px]" />,
            onSelect: () => {
              resetDemo();
              toast.success("Demo thread reset");
            },
          },
        ]
      : []),
  ];

  const myReaction = picker?.message.reactions?.find((r) => r.by === "me")?.type ?? null;

  return (
    <main
      className="relative isolate flex flex-col overflow-hidden bg-[#0E0E11]"
      style={{ height: "var(--app-vh, 100dvh)" }}
    >
      <PulseOverlay
        burst={pulses.burst}
        incoming={Boolean(pulses.incoming)}
        incomingText={pulses.incoming ? `${partnerName} is thinking of you` : null}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        animate={{ opacity: together ? 1 : 0.2 }}
        transition={{ duration: 0.9, ease: "easeInOut" }}
      >
        <div className="absolute -right-28 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.28),transparent_68%)] blur-2xl" />
        <div className="absolute -left-24 top-1/3 h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle_at_center,rgba(120,90,255,0.12),transparent_70%)] blur-3xl" />
      </motion.div>

      <ChatHeader
        name={partnerName}
        avatarId={conversation?.avatarId ?? null}
        online={together}
        status={status}
        typing={partner === "typing" && prefs.typingIndicator}
        hidden={!prefs.showPresence}
        onMenu={() => setMenuOpen(true)}
      />

      <MessageList
        messages={messages}
        partnerName={partnerName}
        typing={partner === "typing" && prefs.typingIndicator && !meta.blocked}
        showReceipts={prefs.readReceipts}
        dividerId={dividerId}
        onLongPress={(message, anchor) => setPicker({ message, anchor })}
        onDoubleTap={handleDoubleTap}
        onRemoveMyReaction={(message) => clearMyReaction(message.id)}
        onRetry={(message) => retry(message.id)}
        onOpenImage={setViewerUrl}
      />

      <ChatInput
        onSend={handleSend}
        onSticker={handleSticker}
        onPulse={handlePulse}
        onAttach={() => setAttachOpen(true)}
        onVoice={() => setAttachOpen(true)}
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
          !together && !meta.blocked && lastSeenAt ? (
            <span>
              {partnerName} left {formatAgo(lastSeenAt)} — your message will be waiting.
            </span>
          ) : undefined
        }
      />

      <ChatMenuSheet
        open={menuOpen}
        name={partnerName}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
      />

      <AnimatePresence>
        {picker && (
          <ReactionPicker
            key={picker.message.id}
            anchor={picker.anchor}
            mine={picker.message.author === "me"}
            myReaction={myReaction}
            onPick={(type) => {
              react(picker.message.id, type);
              setPicker(null);
            }}
            onAction={(action) => runAction(action, picker.message)}
            onClose={() => setPicker(null)}
          />
        )}
      </AnimatePresence>

      <AttachmentSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPhoto={(image) =>
          send(
            `Photo · ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`,
            { kind: "image", media: { url: image.dataUrl, width: image.width, height: image.height } }
          )
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

export default function ThreadPage() {
  return (
    <AppGuard>
      <ThreadScreen />
    </AppGuard>
  );
}
