"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  BellOff,
  Phone,
  PhoneIncoming,
  RotateCcw,
  ShieldOff,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";
import { AttachmentSheet } from "@/components/chat/attachment-sheet";
import { ChatInput } from "@/components/chat/ChatInput";
import { EditBar } from "@/components/chat/edit-bar";
import { ChatHeader, ChatMenuSheet, type ChatMenuAction } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { PulseOverlay } from "@/components/chat/pulse-overlay";
import { ReactionPicker, type BubbleAnchor, type MessageAction } from "@/components/chat/ReactionPicker";
import { authMode } from "@/lib/auth";
import { demoConversations } from "@/lib/chat";
import { markRead, patchMeta, useChatMetaFor } from "@/lib/conversation-meta";
import { formatAgo, usePresence } from "@/lib/presence";
import { buzz, usePrefs } from "@/lib/prefs";
import { playMessageTone } from "@/lib/sound";
import { useLiveCall } from "@/lib/live-call";
import { usePulses } from "@/lib/pulses";
import { QUICK_REACTION, type ReactionType } from "@/lib/reactions";
import { previewFor, useThread, type ChatMessage, type QuotedMessage } from "@/lib/thread";
import { useRemoteThread } from "@/lib/use-remote-thread";
import { useViewportHeight } from "@/lib/use-viewport-height";

const REMOTE = authMode === "supabase";

function ThreadScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;
  const [conversation] = useState(
    () => demoConversations().find((c) => c.id === conversationId) ?? null
  );

  const live = useLiveCall();
  const prefs = usePrefs();
  const meta = useChatMetaFor(conversationId);
  const local = useThread(conversationId, { enabled: !REMOTE });
  const remote = useRemoteThread(conversationId, REMOTE);

  const messages = REMOTE ? remote.messages : local.messages;
  const ready = REMOTE ? remote.ready : local.ready;

  const partnerName = REMOTE
    ? `@${remote.partnerName ?? "…"}`
    : conversation?.name ?? "Them";
  const partnerAvatar = REMOTE ? remote.partnerAvatar : conversation?.avatarId ?? null;

  const { together, partner, lastSeenAt, setPresence } = usePresence({
    demo: !REMOTE,
    logKey: conversationId,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<{ message: ChatMessage; anchor: BubbleAnchor } | null>(null);
  const [replyTo, setReplyTo] = useState<QuotedMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [dividerId, setDividerId] = useState<string | null>(null);
  const marked = useRef(false);
  const lastSeenMessage = useRef<string | null>(null);

  useViewportHeight();

  // a soft chime when their message lands (never for my own sends)
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;
    const previous = lastSeenMessage.current;
    if (previous === null) {
      lastSeenMessage.current = last.id;
      return;
    }
    if (last.id === previous) return;
    lastSeenMessage.current = last.id;
    if (prefs.sounds && last.author === "them") {
      playMessageTone();
      if (prefs.haptics) buzz(8);
    }
  }, [messages, prefs.sounds, prefs.haptics]);

  // Their line lands while you're looking at it → advance the read cursor, so
  // the home list never shows a badge for a message you already saw.
  const themCursor = useRef<string | null>(null);
  useEffect(() => {
    if (REMOTE) return;
    const last = messages[messages.length - 1];
    if (!last || last.author !== "them" || last.kind === "presence") return;
    if (themCursor.current === last.id) return;
    themCursor.current = last.id;
    if (document.visibilityState === "visible") markRead(conversationId);
  }, [messages, conversationId]);

  // Swipe in from the left edge to go back to the inbox (the gesture every phone app has).
  const edge = useRef<{ x: number; y: number; id: number } | null>(null);
  const [edgePull, setEdgePull] = useState(0);

  useEffect(() => {
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || touch.clientX > 34) return;
      edge.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    };
    const onMove = (event: TouchEvent) => {
      if (!edge.current) return;
      const touch = Array.from(event.touches).find((t) => t.identifier === edge.current?.id);
      if (!touch) return;
      const dx = touch.clientX - edge.current.x;
      const dy = Math.abs(touch.clientY - edge.current.y);
      if (dx > 8 && dx > dy) setEdgePull(Math.min(110, dx * 0.55));
    };
    const onEnd = () => {
      if (!edge.current) return;
      edge.current = null;
      setEdgePull((pull) => {
        if (pull > 46) router.push("/app");
        return 0;
      });
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const pulses = usePulses({
    demo: !REMOTE,
    onIncoming: () => {
      if (prefs.haptics) buzz(14);
    },
    onMutual: () => {
      const time = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      local.addMoment(`You both reached for each other at ${time} — pulses crossing in the same minute`);
      toast.success("You both reached for each other", { description: "Saved to your presence moments." });
    },
  });

  // Demo only: the sample partner starts typing a beat after you send.
  useEffect(() => {
    if (REMOTE) return;
    if (messages.length === 0 || messages[messages.length - 1].author !== "me") return;
    setPresence("typing");
    const t = setTimeout(() => setPresence("here"), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, setPresence]);

  // Work out where "new messages" begins, then clear the badge for this chat.
  useEffect(() => {
    if (!ready || marked.current || REMOTE) return;
    marked.current = true;
    const lastRead = meta.lastReadAt ?? 0;
    const firstUnread = messages.find((m) => m.at > lastRead && m.author !== "me");
    if (firstUnread && messages.indexOf(firstUnread) > 0) setDividerId(firstUnread.id);
    markRead(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, conversationId]);

  const online = REMOTE ? remote.online : together;
  const status = useMemo(() => {
    if (online) return "online";
    if (REMOTE) {
      const seen = remote.partnerLastSeenAt ?? remote.partnerLastAt;
      return seen ? `last seen ${formatAgo(seen)}` : "last seen recently";
    }
    return lastSeenAt ? `last seen ${formatAgo(lastSeenAt)}` : "last seen recently";
  }, [online, remote.partnerLastAt, remote.partnerLastSeenAt, lastSeenAt]);

  const handlePulse = useCallback(() => {
    const result = pulses.send();
    if (result === "disabled") {
      toast.error("Pulses are off", { description: "Turn them on in Settings → Presence." });
    } else if (result === "sent" && prefs.haptics) {
      buzz(8);
    }
  }, [pulses, prefs.haptics]);

  // one call site, two backends — remote uploads the media before inserting the row
  const sendNow = (text: string, options?: Parameters<typeof local.send>[1]) => {
    if (REMOTE) {
      const kind =
        options?.kind === "sticker"
          ? "sticker"
          : options?.kind === "image"
            ? "image"
            : options?.kind === "audio"
              ? "audio"
              : options?.kind === "file"
                ? "file"
                : "text";
      remote.send(text, {
        kind,
        sticker: options?.sticker,
        media: options?.media
          ? {
              dataUrl: options.media.url,
              name: options.media.name,
              sizeBytes: options.media.sizeBytes,
              durationMs: options.media.durationMs,
              ext: options.media.ext,
            }
          : undefined,
      });
      return;
    }
    local.send(text, options);
  };
  const reactNow = REMOTE ? remote.react : local.react;
  const clearReactionNow = REMOTE ? remote.clearMyReaction : local.clearMyReaction;
  const retryNow = REMOTE ? remote.retry : local.retry;
  const removeNow = REMOTE ? remote.remove : local.remove;

  const saveEdit = async (id: string, text: string) => {
    try {
      if (REMOTE) await remote.edit(id, text);
      else await local.edit(id, text);
      toast.success("Message updated");
      setEditing(null);
    } catch {
      toast.error("Couldn't edit that message");
    }
  };

  const handleSend = (text: string) => {
    sendNow(text, replyTo ? { replyTo } : {});
    setReplyTo(null);
  };

  const handleSticker = (type: ReactionType) => {
    sendNow("", { kind: "sticker", sticker: type });
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
        toast("Forward", { description: "Forwarding arrives with multi-room threads." });
        break;
      case "edit":
        if (message.kind === "text" && message.author === "me") {
          setEditing({ id: message.id, text: message.text });
        } else {
          toast("Only your own text can be edited");
        }
        break;
      case "delete":
        removeNow(message.id);
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
      onSelect: () =>
        REMOTE
          ? void live.start(conversationId, "voice")
          : router.push(`/app/call/${conversationId}?kind=voice&direction=outgoing`),
    },
    {
      key: "video",
      label: "Video call",
      icon: <Video className="h-[18px] w-[18px]" />,
      onSelect: () =>
        REMOTE
          ? void live.start(conversationId, "video")
          : router.push(`/app/call/${conversationId}?kind=video&direction=outgoing`),
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
      label: meta.muted ? "Unmute" : "Mute",
      icon: <BellOff className="h-[18px] w-[18px]" />,
      active: Boolean(meta.muted),
      onSelect: () => {
        patchMeta(conversationId, { muted: !meta.muted });
        toast.success(meta.muted ? "Notifications on" : "Notifications muted");
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
    ...(!REMOTE
      ? [
          {
            key: "clear",
            label: "Clear chat",
            icon: <Trash2 className="h-[18px] w-[18px]" />,
            onSelect: () => {
              local.clear();
              toast.success("Chat cleared");
            },
          },
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
              local.resetDemo();
              toast.success("Demo thread reset");
            },
          },
        ]
      : []),
  ];

  const myReaction = picker?.message.reactions?.find((r) => r.by === "me")?.type ?? null;

  return (
    <main
      className="relative isolate flex flex-col overflow-hidden bg-[#09090B]"
      style={{ height: "var(--app-vh, 100dvh)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(255,92,122,0.06),transparent_60%)]"
      />

      {edgePull > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-40 w-1.5 rounded-r-full bg-rose/60"
          style={{ transform: `translateX(${edgePull - 6}px)`, opacity: Math.min(1, edgePull / 46) }}
        />
      )}

      <PulseOverlay
        burst={pulses.burst}
        incoming={Boolean(pulses.incoming)}
        incomingText={pulses.incoming ? `${partnerName} is thinking of you` : null}
      />

      <ChatHeader
        name={partnerName}
        avatarId={partnerAvatar}
        avatarUrl={REMOTE ? remote.partnerAvatarUrl : null}
        online={online}
        status={status}
        typing={status === "online" && (REMOTE ? remote.typing : partner === "typing") && prefs.typingIndicator}
        hidden={!prefs.showPresence}
        onMenu={() => setMenuOpen(true)}
        onCall={REMOTE ? (type) => void live.start(conversationId, type) : undefined}
      />

      <MessageList
        messages={messages}
        partnerName={partnerName}
        typing={(REMOTE ? remote.typing : partner === "typing") && prefs.typingIndicator && !meta.blocked}
        showReceipts={prefs.readReceipts}
        compact={prefs.compactChat}
        dividerId={dividerId}
        onLongPress={(message, anchor) => setPicker({ message, anchor })}
        onDoubleTap={(message) => reactNow(message.id, QUICK_REACTION)}
        onRemoveMyReaction={(message) => clearReactionNow(message.id)}
        onRetry={(message) => retryNow(message.id)}
        onOpenImage={setViewerUrl}
        onSwipeReply={(message) =>
          setReplyTo({ id: message.id, author: message.author, text: previewFor(message) })
        }
      />

      <AnimatePresence>
        {editing && (
          <EditBar
            key={editing.id}
            text={editing.text}
            onSave={(next) => saveEdit(editing.id, next)}
            onCancel={() => setEditing(null)}
          />
        )}
      </AnimatePresence>

      <ChatInput
        onSend={handleSend}
        onSticker={handleSticker}
        onPulse={handlePulse}
        onAttach={() => setAttachOpen(true)}
        onVoice={() => setAttachOpen(true)}
        onTyping={() => !REMOTE || remote.notifyTyping()}
        showPulse={!REMOTE}
        pulseCoolingUntil={pulses.coolingUntil}
        pulseDisabled={!prefs.allowPulses}
        placeholder={`Message ${partnerName}`}
        replyTo={
          replyTo ? { author: replyTo.author === "me" ? "You" : partnerName, text: replyTo.text } : null
        }
        onCancelReply={() => setReplyTo(null)}
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
            editable={picker.message.kind === "text"}
            myReaction={myReaction}
            onPick={(type) => {
              reactNow(picker.message.id, type);
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
          sendNow("Photo", {
            kind: "image",
            media: { url: image.dataUrl, width: image.width, height: image.height, ext: "jpg" },
          })
        }
        onVoice={(audio) =>
          sendNow("Voice note", {
            kind: "audio",
            media: { url: audio.dataUrl, durationMs: audio.durationMs, ext: audio.ext },
          })
        }
        onFile={(file) =>
          sendNow(file.name, {
            kind: "file",
            media: { url: file.dataUrl, name: file.name, sizeBytes: file.sizeBytes, ext: file.ext },
          })
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
