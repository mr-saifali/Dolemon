"use client";

import { getSupabase } from "./supabase";
import { isReactionType, type MessageReaction, type ReactionType } from "./reactions";

/**
 * The Supabase side of the thread: conversations, messages and reactions.
 * Everything here is RLS-scoped — the database decides who can read what.
 */

export type DbConversation = {
  id: string;
  partnerId: string;
  partnerUsername: string;
  partnerAvatar: string | null;
  partnerAvatarUrl: string | null;
  partnerLastSeen: number | null;
  lastBody: string | null;
  lastKind: string | null;
  lastAt: number | null;
  lastSender: string | null;
  unread: number;
};

export type DbMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: string;
  body: string;
  at: number;
  /** set once the sender edits the text — rendered as a quiet "edited" */
  editedAt?: number | null;
  /** chat media (photo / voice note / file) — public URL in the chat-media bucket */
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  mediaDurationMs?: number | null;
  reactions: MessageReaction[];
  /** the id of the message this one quotes (Telegram-style reply), if any */
  replyToId?: string | null;
  /** the quoted message, resolved for rendering */
  replyTo?: { id: string; author: "me" | "them"; text: string } | null;
};

type ConversationRow = {
  conversation_id: string;
  partner_id: string;
  partner_username: string | null;
  partner_avatar: string | null;
  partner_avatar_url: string | null;
  partner_last_seen: string | null;
  last_body: string | null;
  last_kind: string | null;
  last_at: string | null;
  last_sender: string | null;
  unread: number | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: string | null;
  body: string | null;
  created_at: string;
  edited_at?: string | null;
  media_url?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_duration?: number | null;
  reply_to_id?: string | null;
};

type ReactionRow = { message_id: string; user_id: string; reaction_type: string };

function mapRow(row: MessageRow): DbMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind ?? "text",
    body: row.body ?? "",
    at: new Date(row.created_at).getTime(),
    editedAt: row.edited_at ? new Date(row.edited_at).getTime() : null,
    mediaUrl: row.media_url ?? null,
    mediaName: row.media_name ?? null,
    mediaSize: row.media_size ?? null,
    mediaDurationMs: row.media_duration ?? null,
    reactions: [],
    replyToId: row.reply_to_id ?? null,
    replyTo: null,
  };
}

/** A human label for a quoted message — mirrors previewFor so the quote in
 *  the bubble matches the preview that was shown while composing. */
function quoteLabel(kind: string, body: string, name?: string | null): string {
  switch (kind) {
    case "image":
      return "📷 Photo";
    case "audio":
      return "🎙️ Voice note";
    case "file":
      return name ? `📎 ${name}` : "📎 File";
    case "sticker":
      return "Reaction";
    default:
      return body || "…";
  }
}

function client() {
  const c = getSupabase();
  if (!c) throw new Error("Supabase isn't configured.");
  return c;
}

export async function myId(): Promise<string | null> {
  const { data } = await client().auth.getUser();
  return data.user?.id ?? null;
}

export async function listConversations(): Promise<DbConversation[]> {
  const { data, error } = await client().rpc("my_conversations");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ConversationRow[]).map((row) => ({
    id: row.conversation_id,
    partnerId: row.partner_id,
    partnerUsername: row.partner_username ?? "someone",
    partnerAvatar: row.partner_avatar,
    partnerAvatarUrl: row.partner_avatar_url ?? null,
    partnerLastSeen: row.partner_last_seen ? new Date(row.partner_last_seen).getTime() : null,
    lastBody: row.last_body,
    lastKind: row.last_kind,
    lastAt: row.last_at ? new Date(row.last_at).getTime() : null,
    lastSender: row.last_sender,
    unread: row.unread ?? 0,
  }));
}

/** Opens (or creates) the 1:1 thread with a handle. Returns the conversation id. */
export async function openDirectConversation(handle: string): Promise<string> {
  const { data, error } = await client().rpc("open_direct_conversation", {
    partner_handle: handle.trim().replace(/^@/, ""),
  });
  if (error) {
    const m = error.message.toUpperCase();
    if (m.includes("NO_SUCH_USER")) throw new Error("No one here goes by that handle.");
    if (m.includes("SELF")) throw new Error("That's you — try a friend's handle.");
    throw new Error("Couldn't open that chat. Try again?");
  }
  return data as string;
}

/** Deletes the whole 1:1 — conversation, messages, memberships (both sides). */
export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await client().rpc("delete_conversation", { target: conversationId });
  if (error) throw new Error(error.message);
}

export type DbPerson = {
  id: string;
  username: string;
  avatarId: string | null;
  avatarUrl: string | null;
};

/** People you could start a room with, by handle. Two characters or more. */
export async function searchUsers(query: string): Promise<DbPerson[]> {
  const term = query.trim().replace(/^@+/, "").toLowerCase();
  if (term.length < 2) return [];

  const { data, error } = await client().rpc("search_users", { q: term });
  if (error) throw new Error(error.message);

  return (
    (data ?? []) as {
      id: string;
      username: string | null;
      avatar_id: string | null;
      avatar_url: string | null;
    }[]
  )
    .filter((row) => Boolean(row.username))
    .map((row) => ({
      id: row.id,
      username: row.username as string,
      avatarId: row.avatar_id,
      avatarUrl: row.avatar_url ?? null,
    }));
}

/** Uploads a compressed photo to the public `avatars` bucket and returns its URL. */
export async function uploadAvatarImage(dataUrl: string): Promise<string> {
  const sb = client();
  const { data: userData } = await sb.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("You're signed out.");

  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userId}/avatar.jpg`;

  const { error } = await sb.storage.from("avatars").upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  // bust the CDN so the new photo shows up straight away
  return `${data.publicUrl}?v=${Date.now()}`;
}

export async function loadThread(
  conversationId: string
): Promise<{ messages: DbMessage[]; me: string | null }> {
  const sb = client();
  // Fetch the most recent window and the local session concurrently; RLS still
  // validates the token on every database request. The old ascending limit
  // showed the oldest 400 and hid newer messages in long conversations.
  const [session, result] = await Promise.all([
    sb.auth.getSession(),
    sb.from("messages").select("*").eq("conversation_id", conversationId)
      .order("created_at", { ascending: false }).limit(400),
  ]);
  const me = session.data.session?.user.id ?? null;
  if (result.error) throw new Error(result.error.message);
  const messages = ((result.data ?? []) as MessageRow[]).reverse().map((row) => ({
    ...mapRow(row),
    reactions: [] as MessageReaction[],
  }));
  const [reactions] = await Promise.all([loadReactions(conversationId, me), resolveQuotes(messages, me)]);
  const withReactions = messages.map((m) => ({ ...m, reactions: reactions.get(m.id) ?? [] }));
  return { messages: withReactions, me };
}

/**
 * Fills in each message's `replyTo`. Quotes to messages already in the window
 * are free; anything older (beyond the 400-row window) is fetched in one batch.
 */
type QuoteRef = { id: string; senderId: string; kind: string; body: string; name?: string | null };

async function resolveQuotes(messages: DbMessage[], me: string | null): Promise<void> {
  const byId = new Map<string, QuoteRef>(
    messages.map((m) => [
      m.id,
      { id: m.id, senderId: m.senderId, kind: m.kind, body: m.body, name: m.mediaName },
    ])
  );
  const missing = Array.from(
    new Set(
      messages
        .filter((m) => m.replyToId && !byId.has(m.replyToId))
        .map((m) => m.replyToId as string)
    )
  );
  if (missing.length > 0) {
    // Split out-of-window originals into bounded requests; do not silently
    // drop quotes when a busy thread has more than 50 distinct originals.
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50));
    const results = await Promise.all(batches.map((ids) => client()
      .from("messages")
      .select("id, sender_id, kind, body, media_name")
      .in("id", ids)
      .limit(50)));
    const data = results.flatMap((result) => result.data ?? []);
    for (const row of (data ?? []) as {
      id: string;
      sender_id: string;
      kind: string | null;
      body: string | null;
      media_name: string | null;
    }[]) {
      byId.set(row.id, {
        id: row.id,
        senderId: row.sender_id,
        kind: row.kind ?? "text",
        body: row.body ?? "",
        name: row.media_name,
      });
    }
  }
  for (const m of messages) {
    if (!m.replyToId) continue;
    const target = byId.get(m.replyToId);
    if (!target) continue; // original was deleted — the quote quietly vanishes
    m.replyTo = {
      id: target.id,
      author: target.senderId === me ? "me" : "them",
      text: quoteLabel(target.kind, target.body, target.name),
    };
  }
}

/** Resolves a single quote for a message that just arrived over realtime. */
export async function fetchMessageQuote(
  messageId: string,
  me: string | null
): Promise<{ id: string; author: "me" | "them"; text: string } | null> {
  const { data } = await client()
    .from("messages")
    .select("id, sender_id, kind, body, media_name")
    .eq("id", messageId)
    .maybeSingle<{
      id: string;
      sender_id: string;
      kind: string | null;
      body: string | null;
      media_name: string | null;
    }>();
  if (!data) return null;
  return {
    id: data.id,
    author: data.sender_id === me ? "me" : "them",
    text: quoteLabel(data.kind ?? "text", data.body ?? "", data.media_name),
  };
}

export async function loadReactions(
  conversationId: string,
  me: string | null
): Promise<Map<string, MessageReaction[]>> {
  const { data, error } = await client().rpc("reactions_for_conversation", { target: conversationId });
  if (error) return new Map();

  const map = new Map<string, MessageReaction[]>();
  for (const row of (data ?? []) as ReactionRow[]) {
    if (!isReactionType(row.reaction_type)) continue;
    const list = map.get(row.message_id) ?? [];
    list.push({ type: row.reaction_type, by: row.user_id === me ? "me" : "them" });
    map.set(row.message_id, list);
  }
  return map;
}

export type MessageKind = "text" | "sticker" | "call" | "image" | "audio" | "file" | "presence";

export type MediaPayload = {
  url: string;
  name?: string;
  sizeBytes?: number;
  durationMs?: number;
};

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

/**
 * Uploads chat media (photo / voice note / file) to the public `chat-media`
 * bucket under `<conversation_id>/…` and returns the public URL. The RLS
 * policy only lets members of that 1:1 write into its folder.
 */
export async function uploadChatMedia(conversationId: string, dataUrl: string, ext = "bin"): Promise<string> {
  const sb = client();
  const { data: userData } = await sb.auth.getUser();
  if (!userData.user?.id) throw new Error("You're signed out.");

  const blob = await (await fetch(dataUrl)).blob();
  if (blob.size > MAX_MEDIA_BYTES) throw new Error("That file is too big (25 MB max).");

  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("chat-media").upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    cacheControl: "31536000",
  });
  if (error) throw new Error(error.message);

  const { data } = sb.storage.from("chat-media").getPublicUrl(path);
  return data.publicUrl;
}

export async function postMessage(
  conversationId: string,
  body: string,
  kind: MessageKind = "text",
  media?: MediaPayload,
  replyToId?: string | null
): Promise<DbMessage> {
  const sb = client();
  const { data: sessionData } = await sb.auth.getSession();
  const sender = sessionData.session?.user.id;
  if (!sender) throw new Error("You're signed out.");

  // The reply column only enters the query when a reply is actually being
  // sent — plain messages keep working even before migration 009 has run.
  const withReply = Boolean(replyToId);
  const columns = withReply
    ? "id, conversation_id, sender_id, kind, body, created_at, edited_at, media_url, media_name, media_size, media_duration, reply_to_id"
    : "id, conversation_id, sender_id, kind, body, created_at, edited_at, media_url, media_name, media_size, media_duration";
  const { data, error } = await sb
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: sender,
      body,
      kind,
      media_url: media?.url ?? null,
      media_name: media?.name ?? null,
      media_size: media?.sizeBytes ?? null,
      media_duration: media?.durationMs ?? null,
      ...(withReply ? { reply_to_id: replyToId } : {}),
    })
    .select(columns)
    .single<MessageRow>();

  if (error) {
    if (withReply && /reply_to_id/i.test(error.message)) {
      throw new Error("Replies aren't set up on the server yet. Ask the admin to run migration 009.");
    }
    throw new Error(error.message);
  }
  return mapRow(data);
}

/** Edit the words of your own text message. RLS refuses anything else. */
export async function editMessage(messageId: string, body: string): Promise<number> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Can't save an empty message.");
  const editedAt = new Date().toISOString();
  const { error } = await client()
    .from("messages")
    .update({ body: trimmed, edited_at: editedAt })
    .eq("id", messageId);
  if (error) throw new Error(error.message);
  return new Date(editedAt).getTime();
}

/** Hard delete of your own message. */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await client().from("messages").delete().eq("id", messageId);
  if (error) throw new Error(error.message);
}

export async function setMyReaction(messageId: string, type: ReactionType): Promise<void> {
  const sb = client();
  const me = (await sb.auth.getUser()).data.user?.id;
  if (!me) throw new Error("You're signed out.");

  const { error } = await sb
    .from("message_reactions")
    .upsert({ message_id: messageId, user_id: me, reaction_type: type }, {
      onConflict: "message_id,user_id",
    });
  if (error) throw new Error(error.message);
}

export async function removeMyReaction(messageId: string): Promise<void> {
  const sb = client();
  const me = (await sb.auth.getUser()).data.user?.id;
  if (!me) return;
  const { error } = await sb
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", me);
  if (error) throw new Error(error.message);
}

/**
 * Marks the thread read. With `shareReads` on (the "Read receipts" toggle),
 * the read cursor is also pushed to the partner so their ticks turn — and
 * broadcast on the thread channel so it happens live, not on their next refresh.
 */
export async function markThreadRead(conversationId: string, shareReads = true): Promise<void> {
  const sb = client();
  await sb.rpc("mark_conversation_read", { target: conversationId });
  if (!shareReads) return;

  const me = (await sb.auth.getUser()).data.user?.id ?? null;
  if (!me) return;
  const at = Date.now();

  // the partner's read cursor — best-effort, never blocks reading
  await sb.rpc("touch_read_cursor", { target: conversationId }).then(
    () => undefined,
    () => undefined
  );

  const channel = sb.channel(`thread:${conversationId}`);
  await channel
    .send({ type: "broadcast", event: "read", payload: { user: me, at } })
    .catch(() => undefined);
  await sb.removeChannel(channel);
}

/** When the other person last opened this thread (their read cursor), or null. */
export async function conversationReadState(conversationId: string): Promise<number | null> {
  const { data, error } = await client().rpc("conversation_read_state", { target: conversationId });
  if (error) return null;
  const at = (data as { partner_read_at?: string | null } | null)?.partner_read_at;
  return at ? new Date(at).getTime() : null;
}

/** New messages as they land, filtered to this conversation. */
export function watchMessages(
  conversationId: string,
  handlers: {
    onInsert: (row: DbMessage) => void;
    onUpdate?: (row: DbMessage) => void;
    onDelete?: (id: string) => void;
    /** the partner opened the thread at `at` — their read cursor moved */
    onRead?: (at: number) => void;
  },
  me?: string | null
) {
  const sb = client();
  const channel = sb
    .channel(`thread:${conversationId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onInsert(mapRow(payload.new as MessageRow))
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => handlers.onUpdate?.(mapRow(payload.new as MessageRow))
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => {
        const old = payload.old as Partial<MessageRow> | undefined;
        if (old?.id) handlers.onDelete?.(old.id);
      }
    )
    .on("broadcast", { event: "read" }, ({ payload }) => {
      const p = payload as { user?: string; at?: number } | null;
      if (!p?.at || p.user === me) return;
      handlers.onRead?.(p.at);
    })
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}

/** Reaction changes — the caller refetches, which is cheap for a two-person thread. */
export function watchReactions(conversationId: string, onChange: () => void) {
  const sb = client();
  const channel = sb
    .channel(`reactions:${conversationId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "message_reactions" },
      () => onChange()
    )
    .subscribe();

  return () => {
    void sb.removeChannel(channel);
  };
}

export type TypingBus = {
  ping: () => void;
  stop: () => void;
};

/**
 * Typing + presence over one Realtime channel. No table involved — nothing to store,
 * nothing to leak.
 */
export function typingBus(
  conversationId: string,
  me: string,
  onPartner: (state: { typing: boolean; online: boolean }) => void
): TypingBus {
  const sb = client();
  const channel = sb.channel(`presence:${conversationId}`, {
    config: { broadcast: { self: false }, presence: { key: me } },
  });

  let lastTyping = 0;

  channel
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      if ((payload as { user?: string })?.user === me) return;
      lastTyping = Date.now();
      onPartner({ typing: true, online: true });
      window.setTimeout(() => {
        if (Date.now() - lastTyping >= 1800) onPartner({ typing: false, online: true });
      }, 1900);
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      const online = Object.keys(state).some((key) => key !== me);
      onPartner({ typing: false, online });
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void channel.track({ user: me, at: Date.now() });
    });

  return {
    ping: () => {
      void channel.send({ type: "broadcast", event: "typing", payload: { user: me } });
    },
    stop: () => {
      void sb.removeChannel(channel);
    },
  };
}
