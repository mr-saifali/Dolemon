import type { ChatMessage } from "./thread";

/**
 * Keep the objects already on screen for rows whose content did not change.
 *
 * `MessageBubble` is memoised on the message object. Rebuilding every message
 * on each poll (every five seconds) or on each reconcile therefore re-rendered
 * the whole thread — and typing at the same moment as an incoming message made
 * the keyboard fight the list. Reusing the old object lets untouched bubbles
 * skip work entirely.
 */
export function reuseUnchanged(previous: ChatMessage[], next: ChatMessage[]): ChatMessage[] {
  if (previous.length === 0 || next.length === 0) return next;
  const byId = new Map(previous.map((message) => [message.id, message]));
  let reused = false;
  const merged = next.map((message) => {
    const old = byId.get(message.id);
    if (!old) return message;
    // Compare every rendered field, not just reaction counts / media URLs.
    // Same-size reaction changes, quote edits and media metadata must repaint.
    const same =
      old.author === message.author && old.at === message.at &&
      old.createdAt === message.createdAt &&
      old.text === message.text && old.kind === message.kind &&
      old.status === message.status && old.editedAt === message.editedAt &&
      old.seenAt === message.seenAt && old.sticker === message.sticker &&
      equalFields(old.replyTo, message.replyTo) &&
      equalFields(old.media, message.media) &&
      equalFields(old.call, message.call) &&
      (old.reactions?.length ?? 0) === (message.reactions?.length ?? 0) &&
      (old.reactions ?? []).every((reaction, i) => equalFields(reaction, message.reactions?.[i]));
    if (!same) return message;
    reused = true;
    return old;
  });
  return reused ? merged : next;
}

/** These message metadata objects contain only primitive values. */
function equalFields<T extends object>(left: T | undefined, right: T | undefined): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  const keys = Object.keys(left) as (keyof T)[];
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}
