"use client";

import { toRemoteSendOptions } from "@/lib/remote-send-options";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
  BellOff,
  Scale,
  Phone,
  PhoneIncoming,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppGuard } from "@/components/app-guard";


import { ChatInput } from "@/components/chat/ChatInput";
import { AttachmentSheet, type AttachmentSheetHandle } from "@/components/chat/attachment-sheet";


import { ChatWallpaper, chatThemeStyle } from "@/components/chat/ChatWallpaper";
import { EditBar } from "@/components/chat/edit-bar";
import { ChatHeader, ChatMenuSheet, type ChatMenuAction } from "@/components/chat/ChatHeader";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MessageList } from "@/components/chat/MessageList";
import { PulseOverlay } from "@/components/chat/pulse-overlay";
import { ReactionPicker, type BubbleAnchor, type MessageAction } from "@/components/chat/ReactionPicker";
import { authMode } from "@/lib/auth";
import { isChatThemeId, isVividChatTheme, resolveChatTheme } from "@/lib/chat-themes";
import { demoConversations } from "@/lib/chat";
import { markRead, patchMeta, useChatMetaFor } from "@/lib/conversation-meta";
import { formatAgo, usePresence } from "@/lib/presence";
import { buzz, usePrefs } from "@/lib/prefs";
import { playMessageTone } from "@/lib/sound";
import { useLiveCall } from "@/lib/live-call";
import { usePulses } from "@/lib/pulses";
import { QUICK_REACTION, type ReactionType } from "@/lib/reactions";
import { previewFor, useThread, type ChatMessage, type QuotedMessage } from "@/lib/thread";
import { deleteConversation } from "@/lib/db";
import { useRemoteThread } from "@/lib/use-remote-thread";
import { useSession } from "@/lib/session";
import { useAppPresence } from "@/lib/app-presence";
import { useDoremon } from "@/lib/doremon/use-doremon";
import { confirmDoremonSharing } from "@/lib/doremon/consent";
import { isKnownOffline, OFFLINE_SEND_NOTICE } from "@/lib/offline/connectivity";
import { clearConversationVideos, prepareVideo, removeVideoFromDevice } from "@/lib/video-storage";
import { parseVideoReference } from "@/lib/video-reference";
import { useViewportHeight } from "@/lib/use-viewport-height";

// These panels are only downloaded when opened, not on every chat visit.
const ConsistencySheet = dynamic(() => import("@/components/chat/consistency-sheet").then((m) => m.ConsistencySheet));
const MessageSearchSheet = dynamic(() => import("@/components/chat/MessageSearchSheet").then((m) => m.MessageSearchSheet));
const ChatThemeSheet = dynamic(() => import("@/components/chat/ChatThemePicker").then((m) => m.ChatThemeSheet));

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
  const theme = resolveChatTheme(meta.chatTheme, prefs.chatTheme);
  const local = useThread(conversationId, { enabled: !REMOTE });
  const remote = useRemoteThread(conversationId, REMOTE, { shareReads: prefs.readReceipts, sharePresence: prefs.showPresence, shareTyping: prefs.typingIndicator });

  const messages = REMOTE ? remote.messages : local.messages;
  const ready = REMOTE ? remote.ready : local.ready;

  const { account } = useSession();
  const appPresence = useAppPresence();
  const myHandle = account?.username ?? "you";

  const partnerName = REMOTE
    ? `@${remote.partnerName ?? "…"}`
    : conversation?.name ?? "Them";
  const partnerAvatar = REMOTE ? remote.partnerAvatar : conversation?.avatarId ?? null;

  // Doremon — watches the room, keeps the record, and speaks only in his room.
  const doremon = useDoremon(conversationId, messages, {
    remote: REMOTE,
    analysisEnabled: prefs.doremonAnalysis,
    me: myHandle,
    partner: partnerName.replace(/^@/, ""),
    meId: account?.id ?? null,
    partnerId: REMOTE ? remote.partnerId : null,
  });

  const { together, partner, lastSeenAt, setPresence } = usePresence({
    demo: !REMOTE,
    logKey: conversationId,
  });

  useEffect(() => {
    if (REMOTE) setPresence(remote.online ? "here" : "away");
  }, [remote.online, setPresence]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const closeCompare = useCallback(() => setCompareOpen(false), []);
  const [themeOpen, setThemeOpen] = useState(false);
  const closeTheme = useCallback(() => setThemeOpen(false), []);
  const [picker, setPicker] = useState<{ message: ChatMessage; anchor: BubbleAnchor } | null>(null);
  const [replyTo, setReplyTo] = useState<QuotedMessage | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachIntent, setAttachIntent] = useState<"camera" | "voice">("voice");
  const attachment = useRef<AttachmentSheetHandle | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [dividerId, setDividerId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [visible, setVisible] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const latestId = messages[messages.length - 1]?.id;
  const { markRead: markRemoteRead, loadError } = remote;
  useEffect(() => {
    if (REMOTE && ready && !loadError && visible && atBottom) markRemoteRead();
  }, [ready, visible, atBottom, latestId, loadError, markRemoteRead]);

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

  const online = REMOTE ? appPresence[conversationId] === "online" : together;
  const status = useMemo(() => {
    if (online) return "online";
    if (REMOTE) {
      return appPresence[conversationId] === "not-visible" ? "offline or not sharing" : "presence unavailable";
    }
    return lastSeenAt ? `last seen ${formatAgo(lastSeenAt)}` : "last seen recently";
  }, [online, appPresence, conversationId, lastSeenAt]);

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
      return remote.send(text, toRemoteSendOptions(options));
    }
    local.send(text, options);
  };
  const reactNow = REMOTE ? remote.react : local.react;
  const clearReactionNow = REMOTE ? remote.clearMyReaction : local.clearMyReaction;
  const retryNow = REMOTE ? remote.retry : local.retry;
  const removeNow = REMOTE ? remote.remove : local.remove;
  // Stable handlers let unchanged message bubbles skip work while typing,
  // receiving a new message, or updating one reaction.
  const openMessageMenu = useCallback((message: ChatMessage, anchor: BubbleAnchor) => setPicker({ message, anchor }), []);
  const quickReact = useCallback((message: ChatMessage) => reactNow(message.id, QUICK_REACTION), [reactNow]);
  const clearReaction = useCallback((message: ChatMessage) => clearReactionNow(message.id), [clearReactionNow]);
  const retryMessage = useCallback((message: ChatMessage) => retryNow(message.id), [retryNow]);
  const swipeReply = useCallback((message: ChatMessage) => {
    if (message.id.startsWith("tmp_") || message.status === "failed") {
      toast.error("Wait until this message is sent before replying.");
      return;
    }
    setReplyTo({ id: message.id, author: message.author, text: previewFor(message) });
  }, []);


  const saveEdit = async (id: string, text: string) => {
    try {
      if (REMOTE) await remote.edit(id, text);
      else await local.edit(id, text);
      toast.success("Message updated");
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't edit that message");
    }
  };

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    // /doremon <anything> — a word to Doremon, not a message to them
    if (/^\/doremon\b/i.test(trimmed)) {
      const question = trimmed.replace(/^\/doremon\s*/i, "").trim();
      if (REMOTE && isKnownOffline()) { toast.error("Doremon needs internet for this request."); return false; }
      if (!question || !confirmDoremonSharing(REMOTE)) return false;
      setReplyTo(null);
      void doremon.ask(question);
      return;
    }
    if (sendNow(text, replyTo ? { replyTo } : {}) === false) return false;
    setReplyTo(null);
  };

  const handleSticker = (type: ReactionType) => {
    if (sendNow("", { kind: "sticker", sticker: type, replyTo: replyTo ?? undefined }) !== false) setReplyTo(null);
  };

  const runAction = (action: MessageAction, message: ChatMessage) => {
    switch (action) {
      case "reply":
        if (message.id.startsWith("tmp_") || message.status === "failed") {
          toast.error("Wait until this message is sent before replying.");
          break;
        }
        setReplyTo({ id: message.id, author: message.author, text: previewFor(message) });
        break;
      case "copy": {
        const text = previewFor(message);
        if (!navigator.clipboard) { toast.error("Copy isn't available on this device."); break; }
        void navigator.clipboard.writeText(text).then(
          () => toast.success("Copied"),
          () => toast.error("Couldn't copy")
        );
        break;
      }
      case "edit":
        if (message.kind === "text" && message.author === "me") {
          setEditing({ id: message.id, text: message.text });
        } else {
          toast("Only your own text can be edited");
        }
        break;
      case "delete":
        void Promise.resolve(removeNow(message.id)).then(async () => {
          if (account?.id && parseVideoReference(message.media?.url)) {
            try { await removeVideoFromDevice(account.id, message.media!.url); }
            catch { toast.error("Message deleted, but its device copy couldn’t be removed."); return; }
          }
          toast.success("Message deleted");
        })
          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't delete that message"));
        break;
    }
    setPicker(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (REMOTE) {
        await deleteConversation(conversationId);
      } else {
        local.clear();
        patchMeta(conversationId, { deleted: true });
      }
      if (account?.id) {
        try { await clearConversationVideos(account.id, conversationId); }
        catch { toast.error("Chat deleted, but some device videos may remain."); }
      }
      toast.success("Chat deleted");
      setDeleteOpen(false);
      router.replace("/app");
    } catch {
      toast.error("Couldn't delete that chat");
      setDeleting(false);
    }
  };

  const menuActions: ChatMenuAction[] = [
    { key: "doremon", label: "Doremon", hint: "AI companion", icon: <Sparkles className="h-[18px] w-[18px]" />, onSelect: () => router.push(`/app/doremon/${conversationId}`) },
    { key: "search", label: "Search messages", icon: <Search className="h-[18px] w-[18px]" />, onSelect: () => setSearchOpen(true) },
    { key: "compare", label: "Compare statements", hint: "not a lie detector", icon: <Scale className="h-[18px] w-[18px]" />, onSelect: () => setCompareOpen(true) },
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
      key: "theme",
      label: "Chat background",
      hint: theme.name,
      icon: <Palette className="h-[18px] w-[18px]" />,
      onSelect: () => setThemeOpen(true),
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
      key: "delete",
      label: "Delete chat",
      icon: <Trash2 className="h-[18px] w-[18px]" />,
      danger: true,
      onSelect: () => setDeleteOpen(true),
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
      data-vivid-wallpaper={isVividChatTheme(theme) ? "true" : undefined}
      style={{ height: "var(--app-vh, 100dvh)", ...chatThemeStyle(theme) }}
    >
      <ChatWallpaper theme={theme} reduceMotion={prefs.reduceMotion} />

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
        typing={(REMOTE ? remote.typing : partner === "typing") && prefs.typingIndicator}
        hidden={!REMOTE && !prefs.showPresence}
        onMenu={() => setMenuOpen(true)}
        onCall={(type) => REMOTE ? void live.start(conversationId, type) : router.push(`/app/call/${conversationId}?kind=${type}&direction=outgoing`)}
      />

      {REMOTE && remote.loadError && (
        <div role="alert" className="relative z-10 mx-4 mt-2 flex items-center justify-between gap-3 rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          <span>Couldn’t load this chat. Your messages may still be on the server.</span>
          <button type="button" onClick={remote.reload} className="shrink-0 underline">Retry</button>
        </div>
      )}
      <MessageList
        conversationId={conversationId}
        hasOlder={REMOTE && remote.hasOlder}
        loadingOlder={remote.loadingOlder}
        onLoadOlder={remote.loadOlder}
        onBottomChange={setAtBottom}
        messages={messages}
        partnerName={partnerName}
        partnerAvatarId={partnerAvatar}
        partnerAvatarUrl={REMOTE ? remote.partnerAvatarUrl : null}
        typing={(REMOTE ? remote.typing : partner === "typing") && prefs.typingIndicator}
        showReceipts={prefs.readReceipts}
        compact={prefs.compactChat}
        dividerId={dividerId}
        doremon={doremon.doremonMessages}
        doremonThinking={doremon.thinking}
        onLongPress={openMessageMenu}
        onDoubleTap={quickReact}
        onRemoveMyReaction={clearReaction}
        onRetry={retryMessage}
        onOpenImage={setViewerUrl}
        onSwipeReply={swipeReply}
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
        disabled={REMOTE && (!ready || remote.loadError || !remote.me)}
        hint={REMOTE && (!ready || remote.loadError || !remote.me) ? "Connect to load the chat before sending." : undefined}
        onSend={handleSend}
        onSticker={handleSticker}
        onPulse={handlePulse}
        onAttach={() => attachment.current?.openPhoto()}
        onCamera={() => { setAttachIntent("camera"); setAttachOpen(true); attachment.current?.openCamera(); }}
        onFile={() => attachment.current?.openFile()}
        onVideo={() => attachment.current?.openVideo()}
        onVoice={() => { setAttachIntent("voice"); setAttachOpen(true); attachment.current?.startVoice(); }}
        publicMedia={REMOTE}
        onTyping={() => { if (REMOTE && prefs.typingIndicator) remote.notifyTyping(); }}
        showPulse={!REMOTE}
        pulseCoolingUntil={pulses.coolingUntil}
        pulseDisabled={!prefs.allowPulses}
        placeholder={`Message ${partnerName}`}
        replyTo={
          replyTo ? { author: replyTo.author === "me" ? "You" : partnerName, text: replyTo.text } : null
        }
        onCancelReply={() => setReplyTo(null)}
      />

      {searchOpen && <MessageSearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} conversationId={conversationId} remote={REMOTE} me={remote.me} messages={messages} />}
      {themeOpen && <ChatThemeSheet
        open={themeOpen}
        value={theme.id}
        inherited={!isChatThemeId(meta.chatTheme)}
        onChange={(id) => patchMeta(conversationId, { chatTheme: id })}
        onReset={() => patchMeta(conversationId, { chatTheme: undefined })}
        onClose={closeTheme}
      />}

      <ChatMenuSheet
        open={menuOpen}
        name={partnerName}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete this chat?`}
        description={`Messages are removed for both of you with no undo. Uploaded files may remain accessible by their links; AI memories may also be retained.`}
        confirmLabel="Delete chat"
        busy={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
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

      {compareOpen && <ConsistencySheet messages={messages} onClose={closeCompare} hasOlder={REMOTE && remote.hasOlder} loadingOlder={remote.loadingOlder} onLoadOlder={REMOTE ? remote.loadOlder : undefined} />}

      <AttachmentSheet
        ref={attachment}
        publicMedia={REMOTE}
        preferred={attachIntent}
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPhoto={(image) => {
          sendNow("Photo", {
            replyTo: replyTo ?? undefined,
            kind: "image",
            media: { url: image.dataUrl, width: image.width, height: image.height, ext: "jpg" },
          });
          setReplyTo(null);
        }}
        onVoice={(audio) => {
          sendNow("Voice note", {
            replyTo: replyTo ?? undefined,
            kind: "audio",
            media: { url: audio.dataUrl, durationMs: audio.durationMs, ext: audio.ext },
          });
          setReplyTo(null);
        }}
        onVideo={async (file) => {
          if (REMOTE && isKnownOffline()) throw new Error(OFFLINE_SEND_NOTICE);
          if (!account?.id) throw new Error("Sign in before sending a video.");
          const reference = await prepareVideo(account.id, conversationId, file, REMOTE);
          sendNow(file.name.slice(0, 180) || "Video", { replyTo: replyTo ?? undefined, kind: "file", media: { url: reference, name: file.name.slice(0, 180) || "Video", sizeBytes: file.size } });
          setReplyTo(null);
        }}
        onFile={(file) => {
          sendNow(file.name, {
            replyTo: replyTo ?? undefined,
            kind: "file",
            media: { url: file.dataUrl, name: file.name, sizeBytes: file.sizeBytes, ext: file.ext },
          });
          setReplyTo(null);
        }}
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
