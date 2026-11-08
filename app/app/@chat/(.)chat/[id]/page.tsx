/**
 * Soft navigation from the inbox into a chat: the same chat screen, rendered
 * in the `@chat` slot so the inbox stays alive underneath it for the
 * swipe-back transition. One source of truth — this re-exports the real page.
 */
export { default } from "../../../chat/[id]/page";
