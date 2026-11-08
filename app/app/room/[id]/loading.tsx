/** Frame only: the shell shows no animated placeholder while a screen opens. */
export default function RoomLoading() {
  return (
    <main aria-busy="true" aria-label="Opening room" className="flex h-[100dvh] flex-col bg-ink">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="h-6 w-6 rounded-full bg-white/[0.06]" />
        <div className="h-8 w-8 rounded-full bg-white/[0.06]" />
      </div>
    </main>
  );
}
