"use client";

import Link from "next/link";

/** Never render raw server errors, tokens or chat content into a crash screen. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-6 safe-t safe-b" role="alert">
    <h1 className="text-2xl text-text">We couldn&apos;t open this screen</h1>
    <p className="text-text-muted">Check your connection and try again. Your account has not been deleted. Avoid clearing app storage: saved device videos may not have another copy.</p>
    <button type="button" onClick={reset} className="rounded-full bg-white/10 px-5 py-3 text-text">Try again</button>
    <Link href="/app" className="text-center text-rose">Return to inbox</Link>
  </main>;
}
