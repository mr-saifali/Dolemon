/** Fast navigation feedback while an app route's code loads. */
export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading page" className="min-h-dvh bg-ink px-4 safe-t">
      <div className="mx-auto w-full max-w-2xl pt-5" aria-hidden="true">
        <div className="h-10 w-40 rounded-xl bg-white/5" />
        <div className="mt-7 h-16 rounded-2xl bg-white/5" />
        <div className="mt-3 h-16 rounded-2xl bg-white/5" />
        <div className="mt-3 h-16 rounded-2xl bg-white/5" />
      </div>
    </main>
  );
}
