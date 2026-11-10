import Link from "next/link";
export const metadata = { title: "Privacy and product limitations — Dolemon" };
export default function PrivacyPage() {
  return <main className="mx-auto min-h-dvh max-w-2xl space-y-6 px-6 py-12 text-sm leading-relaxed text-text-muted safe-t safe-b">
    <Link href="/app" className="text-rose">Back to Dolemon</Link>
    <h1 className="text-2xl text-text">Privacy and product limitations</h1>
    <p>This is a factual description of the current test release, not a promise of audited security or regulatory compliance.</p>
    <h2 className="text-lg text-text">Accounts and conversations</h2>
    <p>Live accounts use Supabase for email authentication, profiles, messages, media and access rules. Chat text is stored on the server; it is not end-to-end encrypted. The project operator and infrastructure providers may be able to access stored data. A private profile limits discovery; it does not encrypt messages.</p>
    <h2 className="text-lg text-text">This device</h2>
    <p>Recent chats, account information and Doremon exchanges are cached on this device for offline use. These caches are not independently encrypted by Dolemon. App lock is a screen lock, not storage encryption. Saved videos may remain on this device after their temporary server copy is removed; keep a copy before uninstalling or clearing app storage. Do not share an unlocked device with untrusted people.</p>
    <h2 className="text-lg text-text">Calls and external content</h2>
    <p>WebRTC encrypts live call media in transit. Connection setup uses Supabase signalling and third-party STUN services. Peer-to-peer calls can expose your network address to the other person. Restrictive networks may prevent calls because TURN relay service is not currently configured. Opening external links or embedded content can disclose network information to those websites.</p>
    <h2 className="text-lg text-text">Optional AI</h2>
    <p>With explicit approval, Doremon sends bounded selected conversation text and recent questions to Google&apos;s AI service. It can include personal information. Obtain the other person&apos;s permission first. AI responses can be wrong and should not be treated as facts or professional advice. Automatic local analysis does not call the paid provider.</p>
    <h2 className="text-lg text-text">Deletion and support</h2>
    <p>Clearing cached chats removes only the recent offline message cache, not your server account, saved device videos or all AI history. Uninstalling removes app-local data but not server data. In-app account deletion, blocking and abuse reporting are not currently available. Contact the person operating or distributing this test build to arrange server data deletion or report abuse. Do not use this test release for highly sensitive conversations or distribute it as a fully moderated production service.</p>
    <h2 className="text-lg text-text">Notifications and connectivity</h2>
    <p>Cached conversations can be read offline. Sending, receiving, verification and calls need connectivity. Browser push requires permission and a supported browser. Closed-app Android notifications require native FCM setup, which is not included in this release.</p>
  </main>;
}
