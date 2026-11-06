import type { ChatMessage } from "./thread";

export function relativeMessageTime(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** A cursor is a best-effort observation, not a delivery confirmation. */
export function messageStatusLabel(message: ChatMessage, showReceipts: boolean, now = Date.now()): string {
  if (message.status === "failed") return "Not sent";
  if (message.status === "sending") return "Sending…";
  if (!message.status) return "Status unavailable";
  if (showReceipts && message.status === "read") return message.seenAt != null ? `Seen ${relativeMessageTime(message.seenAt, now)}` : "Seen";
  return `Sent ${relativeMessageTime(message.at, now)}`;
}
