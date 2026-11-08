/**
 * Nothing is open in the `@chat` slot while the inbox, settings or a room is
 * on screen. Without this the inbox would 404 for the missing slot.
 */
export default function ChatSlotDefault() {
  return null;
}
