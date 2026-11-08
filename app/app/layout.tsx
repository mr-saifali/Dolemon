import type { ReactNode } from "react";
import { ChatTransitionLayer } from "@/components/chat/swipe-back";

/**
 * The inbox stays mounted while a chat is open.
 *
 * `/app/chat/[id]` is intercepted into the `@chat` slot (see
 * `./@chat/(.)chat/[id]/page.tsx`), so opening a chat is a change of *slot*
 * rather than a change of page: the inbox never unmounts and keeps its scroll
 * position and subscriptions. That is what makes the swipe-back transition
 * possible — the chat shrinks and slides right to reveal the inbox that was
 * behind it all along, instead of a black screen.
 *
 * A direct visit to `/app/chat/[id]` (a deep link) skips the interception and
 * renders the chat as a normal page; the wrapper then falls back to
 * `router.replace("/app")` when it is dismissed.
 */
export default function AppSectionLayout({
  children,
  chat,
}: {
  children: ReactNode;
  /** the `@chat` parallel slot */
  chat: ReactNode;
}) {
  return <ChatTransitionLayer chat={chat}>{children}</ChatTransitionLayer>;
}
