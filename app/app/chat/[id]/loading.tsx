/** Frame only: the shell shows no animated placeholder while a chat opens. */
export default function ChatLoading() {
  return (
    <main aria-busy="true" aria-label="Opening chat" className="flex h-[100dvh] flex-col bg-ink">
      <div className="flex h-[60px] items-center gap-2 px-3">
        <div className="h-6 w-6 rounded-full bg-white/[0.06]" />
        <div className="h-8 w-8 rounded-full bg-white/[0.06]" />
      </div>
    </main>
  );
}
