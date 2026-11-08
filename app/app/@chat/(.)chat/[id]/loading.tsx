/**
 * The slot sits on top of the inbox, so its loading state has to float too —
 * a block in the normal document flow would push the inbox around.
 */
export default function ChatSlotLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading chat"
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-[#09090B] px-4"
    >
      <div className="flex h-16 items-center gap-3 border-b border-white/5">
        <div className="h-9 w-9 rounded-full bg-white/5" />
        <div className="h-3 w-28 rounded-full bg-white/5" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 pb-6" aria-hidden="true">
        <div className="h-10 w-36 rounded-2xl bg-white/5" />
        <div className="ml-auto h-10 w-44 rounded-2xl bg-white/5" />
        <div className="h-10 w-48 rounded-2xl bg-white/5" />
      </div>
      <div className="mb-6 h-12 rounded-full bg-white/5" />
    </div>
  );
}
