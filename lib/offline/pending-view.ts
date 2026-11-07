import type { OfflineSnapshot, OfflineMessage } from "./snapshot";
import { validateOfflineMutation, type OfflineSession, type QueueEntry } from "./mutation-queue";

export type OfflinePending = { id: string; kind: "edit" | "delete" | "reaction"; status: QueueEntry["status"] };
export type OfflineMessageView = OfflineMessage & { pending: OfflinePending[]; deletionPending: boolean };
export type OfflineView = { conversations: { conversationId: string; messages: OfflineMessageView[] }[]; detached: OfflinePending[] };

/**
 * A view of durable pending changes, never a mutation of the stored server
 * snapshot. A deletion remains visible and labelled until confirmed. Changes
 * outside the latest-six window remain visible in `detached` for a pending
 * changes screen; they must never be discarded just because a snapshot changed.
 * This pure projection does not persist or sync anything and is not wired yet.
 */
export function projectPendingChanges(snapshot: OfflineSnapshot, session: OfflineSession, entries: QueueEntry[]): OfflineView {
  if (!session.accountId || !session.generation || snapshot.accountId !== session.accountId) throw new Error("Offline account mismatch.");
  const conversations = snapshot.conversations.map(({ conversation, messages }) => ({
    conversationId: conversation.id,
    messages: messages.map((message): OfflineMessageView => ({ ...message, reactions: [...message.reactions], pending: [], deletionPending: false })),
  }));
  const messages = new Map<string, OfflineMessageView>();
  for (const conversation of conversations) for (const message of conversation.messages) {
    const key = `${conversation.conversationId}\u0000${message.id}`;
    if (messages.has(key) || message.conversationId !== conversation.conversationId) throw new Error("Invalid offline snapshot.");
    messages.set(key, message);
  }
  const detached: OfflinePending[] = [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const op = entry?.mutation;
    if (!op || op.accountId !== session.accountId || !op.id || ids.has(op.id) || !["pending", "inflight", "conflict"].includes(entry.status)) throw new Error("Invalid offline queue.");
    validateOfflineMutation(session, op);
    ids.add(op.id);
    const pending: OfflinePending = { id: op.id, kind: op.kind, status: entry.status };
    const message = messages.get(`${op.conversationId}\u0000${op.messageId}`);
    if (!message) { detached.push(pending); continue; }
    message.pending.push(pending);
    if (op.kind === "edit") message.body = op.text;
    else if (op.kind === "delete") message.deletionPending = true;
    else if (op.kind === "reaction") {
      message.reactions = message.reactions.filter((reaction) => reaction.by !== "me");
      if (op.reaction !== null) message.reactions.push({ by: "me", type: op.reaction });
    } else throw new Error("Invalid offline operation.");
  }
  return { conversations, detached };
}
