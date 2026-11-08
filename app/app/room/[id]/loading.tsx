/** Immediate navigation feedback while a room's code loads. */
export default function RoomLoading() {
  return (
    <main aria-busy="true" aria-label="Opening room" className="flex h-[100dvh] flex-col bg-ink">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="h-9 w-9 rounded-full bg-white/5" />
        <div className="h-3 w-24 rounded-full bg-white/5" />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-3 py-4" aria-hidden="true">
        <div className="h-20 rounded-2xl bg-white/5" />
        <div className="h-12 w-2/3 rounded-2xl bg-white/5" />
      </div>
    </main>
  );
}
