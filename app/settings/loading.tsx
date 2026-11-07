/** Immediate feedback when navigating to settings on a slower connection. */
export default function SettingsLoading() {
  return (
    <main aria-busy="true" aria-label="Loading settings" className="min-h-dvh bg-ink px-6 safe-t">
      <div className="mx-auto w-full max-w-md pt-5" aria-hidden="true">
        <div className="h-8 w-28 rounded-lg bg-white/5" />
        <div className="mt-7 h-20 rounded-2xl bg-white/5" />
        <div className="mt-7 h-40 rounded-2xl bg-white/5" />
      </div>
    </main>
  );
}
