/** Immediate navigation feedback while Doremon's room code loads. */
export default function DoremonLoading() {
  return (
    <main aria-busy="true" aria-label="Opening Doremon" className="flex h-[100dvh] flex-col bg-ink">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="h-9 w-9 rounded-full bg-white/5" />
        <div className="h-9 w-9 rounded-full bg-white/5" />
        <div className="ml-auto h-8 w-8 rounded-full bg-white/5" />
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-3 py-4" aria-hidden="true">
        <div className="h-24 rounded-2xl bg-white/5" />
        <div className="h-14 w-4/5 rounded-2xl bg-white/5" />
        <div className="ml-auto h-14 w-3/5 rounded-2xl bg-white/5" />
      </div>
      <div className="mb-6 px-3">
        <div className="h-12 rounded-full bg-white/5" />
      </div>
    </main>
  );
}
