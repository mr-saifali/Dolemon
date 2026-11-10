import Link from "next/link";
import { notFound } from "next/navigation";
import { USERNAME_PATTERN } from "@/lib/auth/types";

export const metadata = { title: "Dolemon invitation", robots: { index: false, follow: false } };

/** No public profile lookup: private people are not exposed to anonymous visitors. */
export default async function InvitePage({ params }: { params: Promise<{ username: string }> }) {
  const username = (await params).username.toLowerCase();
  if (!USERNAME_PATTERN.test(username)) notFound();
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 safe-t safe-b">
    <h1 className="break-words text-3xl text-text">Find @{username} on Dolemon</h1>
    <p className="text-text-muted">Sign in, then search for this exact handle in your inbox. This invitation does not confirm that an account exists, and it never grants access to a conversation.</p>
    <Link href="/signin" className="rounded-full bg-white/10 px-6 py-3 text-center text-text">Sign in</Link>
    <Link href="/signup/email" className="text-center text-rose">Create an account</Link>
    <p className="text-sm text-text-muted">Already signed in? <Link href="/app" className="text-rose">Open your inbox</Link> and search @{username}.</p>
    <Link href="/privacy" className="text-sm text-text-muted underline">Privacy and product limitations</Link>
  </main>;
}
