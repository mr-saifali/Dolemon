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
  reactions: MessageReaction[];
};

type ConversationRow = {
  conversation_id: string;
  partner_id: string;
  partner_username: string | null;
  partner_avatar: string | null;
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
};

type ReactionRow = { message_id: string; user_id: string; reaction_type: string };

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

export async function loadThread(
  conversationId: string
): Promise<{ messages: DbMessage[]; me: string | null }> {
  const sb = client();
  const me = (await sb.auth.getUser()).data.user?.id ?? null;

  const { data: rows, error } = await sb
    .from("messages")
    .select("id, conversation_id, sender_id, kind, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(400);

  if (error) throw new Error(error.message);
  const messages = ((rows ?? []) as MessageRow[]).map((row) => ({
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind ?? "text",
    body: row.body ?? "",
    at: new Date(row.created_at).getTime(),
    reactions: [] as MessageReaction[],
  }));

  const reactions = await loadReactions(conversationId, me);
  return { messages: messages.map((m) => ({ ...m, reactions: reactions.get(m.id) ?? [] })), me };
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

export async function postMessage(
  conversationId: string,
  body: string,
  kind: "text" | "sticker" = "text"
): Promise<DbMessage> {
  const sb = client();
  const { data: userData } = await sb.auth.getUser();
  const sender = userData.user?.id;
  if (!sender) throw new Error("You're signed out.");

  const { data, error } = await sb
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: sender, body, kind })
    .select("id, conversation_id, sender_id, kind, body, created_at")
    .single<MessageRow>();

  if (error) throw new Error(error.message);
  return {
    id: data.id,
    conversationId: data.conversation_id,
    senderId: data.sender_id,
    kind: data.kind ?? "text",
    body: data.body ?? "",
    at: new Date(data.created_at).getTime(),
    reactions: [],
  };
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

export async function markThreadRead(conversationId: string): Promise<void> {
  await client().rpc("mark_conversation_read", { target: conversationId });
}

/** New messages as they land, filtered to this conversation. */
export function watchMessages(conversationId: string, onInsert: (row: DbMessage) => void) {
  const sb = client();
  const channel = sb
    .channel(`thread:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as MessageRow;
        onInsert({
          id: row.id,
          conversationId: row.conversation_id,
          senderId: row.sender_id,
          kind: row.kind ?? "text",
          body: row.body ?? "",
          at: new Date(row.created_at).getTime(),
          reactions: [],
        });
      }
    )
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
