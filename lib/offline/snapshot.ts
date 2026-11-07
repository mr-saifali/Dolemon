import type { DbConversation, DbMessage } from "@/lib/db";

/**
 * Offline snapshot construction only. No production storage or native bridge is
 * connected yet. A caller MUST use an encrypted, account-scoped transaction;
 * this module must not be wired to localStorage, IndexedDB, or the service worker.
 */
export const OFFLINE_MESSAGE_LIMIT = 6;
export const MAX_OFFLINE_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export type OfflineAttachment =
  | { state: "saved"; key: string; bytes: number; mime: string }
  | { state: "unavailable" };
export type OfflineMessage = Omit<DbMessage, "mediaUrl"> & { attachment: OfflineAttachment | null };
export type OfflineConversation = { conversation: DbConversation; messages: OfflineMessage[] };
export type OfflineSnapshot = {
  version: 1;
  accountId: string;
  savedAt: number;
  conversations: OfflineConversation[];
};

export type OfflineSyncSource = {
  /** Enumerate every RLS-visible conversation, without server result-limit truncation. */
  conversations(signal: AbortSignal): AsyncIterable<readonly DbConversation[]>;
  /** Must request the latest six, not merely the chats the user has opened. */
  thread(id: string, signal: AbortSignal): Promise<{ me: string | null; messages: DbMessage[] }>;
  /**
   * Return null when a media item is unavailable. The real adapter must only
   * read approved storage paths and must not delete temporary video copies.
   */
  attachment(message: DbMessage, signal: AbortSignal): Promise<Blob | null>;
};

/**
 * Future native transaction contract: staging is encrypted, per-account, and
 * private. commitIfCurrent must atomically check the native session generation
 * and replace the snapshot; sign-out invalidates that generation BEFORE cleanup.
 * Abort must remove only this transaction's staged data, never a prior snapshot.
 */
export type OfflineSnapshotTransaction = {
  stageAttachment(messageId: string, data: Blob, signal: AbortSignal): Promise<string>;
  commitIfCurrent(snapshot: OfflineSnapshot, signal: AbortSignal): Promise<boolean>;
  abort(): Promise<void>;
};

function checkActive(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Offline sync cancelled", "AbortError");
}

/**
 * Build a complete snapshot transactionally. Only the six newest messages per
 * chat are accepted. Attachment download failures are explicitly marked, but
 * storage errors or an incomplete chat list abort the entire replacement.
 * This function performs no automatic sync, queueing, or persistent writes.
 */
export async function buildOfflineSnapshot(
  accountId: string,
  source: OfflineSyncSource,
  transaction: OfflineSnapshotTransaction,
  signal: AbortSignal,
  now: () => number = Date.now
): Promise<OfflineSnapshot> {
  let committed = false;
  try {
    if (!accountId) throw new Error("Offline sync requires an account.");
    checkActive(signal);
    const conversations: OfflineConversation[] = [];
    const seen = new Set<string>();
    const seenMessages = new Set<string>();
    for await (const page of source.conversations(signal)) {
      checkActive(signal);
      for (const conversation of page) {
        checkActive(signal);
        if (!conversation.id || seen.has(conversation.id)) throw new Error("Invalid or duplicate conversation in offline sync.");
        seen.add(conversation.id);
        const thread = await source.thread(conversation.id, signal);
        checkActive(signal);
        if (thread.me !== accountId) throw new Error("Account changed during offline sync.");
        if (thread.messages.length > OFFLINE_MESSAGE_LIMIT || thread.messages.some((message) => message.conversationId !== conversation.id)) {
          throw new Error("Invalid offline message window.");
        }
        const messages: OfflineMessage[] = [];
        for (const message of thread.messages) {
          checkActive(signal);
          if (!message.id || seenMessages.has(message.id)) throw new Error("Invalid or duplicate offline message.");
          seenMessages.add(message.id);
          let attachment: OfflineAttachment | null = ["image", "audio", "file"].includes(message.kind) && !message.mediaUrl ? { state: "unavailable" } : null;
          if (message.mediaUrl) {
            let blob: Blob | null = null;
            try { blob = await source.attachment(message, signal); } catch { checkActive(signal); }
            checkActive(signal);
            if (!blob || blob.size <= 0 || blob.size > MAX_OFFLINE_ATTACHMENT_BYTES) {
              attachment = { state: "unavailable" };
            } else {
              const key = await transaction.stageAttachment(message.id, blob, signal);
              checkActive(signal);
              if (!key) throw new Error("Unable to stage offline attachment.");
              attachment = { state: "saved", key, bytes: blob.size, mime: blob.type || "application/octet-stream" };
            }
          }
          // Do not leave a network URL in the offline reader. Media comes only
          // from encrypted staged files, never an implicit online request.
          const { mediaUrl: _url, ...offlineMessage } = message;
          messages.push({ ...offlineMessage, attachment });
        }
        // Avatar URLs are online resources, not encrypted offline attachments.
        // Do not leave them for a reader to fetch implicitly.
        conversations.push({ conversation: { ...conversation, partnerAvatarUrl: null }, messages });
      }
    }
    checkActive(signal);
    const snapshot: OfflineSnapshot = { version: 1, accountId, savedAt: now(), conversations };
    committed = await transaction.commitIfCurrent(snapshot, signal);
    if (!committed) throw new Error("Offline account changed before saving.");
    return snapshot;
  } finally {
    if (!committed) await transaction.abort();
  }
}
