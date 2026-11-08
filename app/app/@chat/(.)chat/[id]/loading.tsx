/**
 * The slot sits on top of the inbox, so its loading state has to float too —
 * a block in the normal document flow would push the inbox around. It shows
 * the chat's frame and nothing that moves.
 */
export default function ChatSlotLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Opening chat"
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-[#09090B]"
    >
      <div className="flex h-[60px] items-center gap-2 px-3">
        <div className="h-6 w-6 rounded-full bg-white/[0.06]" />
        <div className="h-8 w-8 rounded-full bg-white/[0.06]" />
      </div>
    </div>
  );
}
