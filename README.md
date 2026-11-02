# Dolemon

A private, invite-only space for **one-to-one** conversations. No groups, no noise.

Mobile-first (designed at 390px) and centred `max-w-md` on desktop.

## Deploy

Supabase project `dolemon` is already provisioned (schema + RLS + presence tables).
Vercel deployment is blocked on account permissions — see [DEPLOY.md](./DEPLOY.md) for the
one-step fix, the env var list and the OTP caveats.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No backend needed to click through onboarding: without Supabase keys the app uses a
self-contained local provider, and the emailed code is shown on the verify screen
(any code also accepts `123456` in demo mode).

## Onboarding flow

| Step | Route | What happens |
| --- | --- | --- |
| 1 | `/` | Welcome — "A private space for just you two." |
| 2 | `/signup/email` | Email entry, zod-validated |
| 3 | `/signup/verify` | 6-digit OTP, auto-advance, auto-submit, 30s resend cooldown, 10-min expiry, 5-attempt cap |
| 4 | `/signup/password` | Password creation with live strength meter |
| 5 | `/signup/username` | Live availability check (400ms debounce) + optional emoji avatar |
| 6 | `/signup/success` | Animated confirmation → `/app` |

Plus `/signin`, `/app` (chat home), `/app/chat/[id]` (thread),
`/settings` (avatar + app password), `/unlock`.

## Home screen (`/app`)

Greeting + handle, account avatar → settings, live search across names/handles/messages,
All / Unread filters, and a 1:1 conversation list with unread badges, online dots,
"typing…", pinned and muted states. Tapping a row opens the thread; the rose FAB opens
the new-chat sheet with your invite link. In demo mode the list is sample data
(labelled as such); with Supabase configured it renders real rows once the backend lands.

## Chat thread (`/app/chat/[id]`)

Built around **presence**, not around an inbox:

- The room is a place you are both *in*. When you both are, the ambient rose light comes up,
  the header reads "You're both here · 4m" with a shared clock, and a hairline ribbon under
  the header comes alive. When one of you leaves, the light drops and the composer quietly
  says "Aarohi left 2m ago — your message will be waiting."
- **Presence moments** are timeline items in their own right ("You were both here together
  yesterday · 22 minutes") — something a normal chat log can't show.
- Bubbles with day dividers, 3-minute grouping, delivery ticks (sent → delivered → read),
  typing bubble, auto-growing composer (Enter to send, Shift+Enter for a newline).
- Demo partner replies ~3.4s after you send and presence drifts in and out every 18s so the
  layer is visible; "Reset demo thread" lives in the chat menu.

Presence lives in `lib/presence.ts` with a single seam to a realtime channel — see
`docs/supabase.md` §4 for the Realtime + `presence_moments` mapping.

### Pulses

The heart in the composer sends a **pulse** — the smallest possible "thinking of you" that
isn't a message. It leaves nothing in the thread: hearts drift up, the room warms, and it's
gone. You can send one every 15s (the ring drains so the limit is felt). If two pulses cross
within a minute, that *does* get remembered as a presence moment.

### The room (`/app/room/[id]`)

- Your two avatars with a live line between them, lit only when you're both in.
- **Leave a light on** — a warm glow that stays in the room while you're away.
- **Together today** — minutes you've shared, a 7-day chart and a streak, all from logged
  presence sessions rather than fake numbers.
- **Presence moments** — the last few times you were both here, with times and lengths.

### Presence controls

`/settings` → Presence: *Show when I'm here* (invisible mode) and *Allow pulses*. Both are
respected everywhere — the header reads "You're invisible" when you switch yourself off.

## Calls (`/app/call/[id]`)

Voice and video call UI with the full state machine: `dialing → ringing → connected → ended`,
plus an incoming variant with accept/decline, missed-call handling, a live timer, mute,
speaker, camera on/off, camera flip, wake-lock, and a call entry written back into the thread
(`Voice call · 4m 12s` / `Missed voice call`). Demo mode simulates the media; the WebRTC
wiring checklist is in `docs/supabase.md` §6.

Start one from the phone/video icons in a chat header, or from the chat menu →
*Simulate incoming call*.

## Everything else a messenger needs

- **Message actions** — long-press any bubble: react (❤️ 😌 😂 🥺 🔥 👍), reply with quote,
  copy, delete for me.
- **Attachments** — photos (downscaled to fit device storage) with a full-screen viewer, and
  voice notes recorded with MediaRecorder up to 60s with a live waveform.
- **Unread divider** — a "New" line marks where you left off, backed by per-chat read state.
- **Chat management** — long-press a row on home to pin, mute, mark read, or delete a chat.
- **Privacy controls** — read receipts, typing indicator and haptics, each working in both
  directions (Settings → Chats & privacy).

## Not built yet (deliberately)

| Gap | Why |
| --- | --- |
| End-to-end encryption | Needs a server-side key exchange; the app-lock is a UI gate, not encryption |
| Push notifications | Requires Web Push + service worker + a backend sender |
| Real media storage | Photos/voice notes live on-device until Supabase Storage is wired |
| Multi-device sync | Single-device local state today |
| Block / report, backups | Server-authoritative features that follow the backend |
| Message editing, in-chat search | Next polish pass once data is real |

## Stack

Next.js 14 App Router · TypeScript · Tailwind · shadcn-style components (Radix + cva) ·
react-hook-form + zod · framer-motion · Supabase Auth (optional).

## Structure

```
app/                 routes for every onboarding screen
components/ui        button, input, field-error primitives
components/onboarding step dots, OTP input
lib/auth/            AuthProvider interface + supabase and local implementations
lib/session.tsx      session context
lib/crypto.ts        PBKDF2 hashing for the local provider / app lock
docs/supabase.md     schema, RLS and RPCs to switch on real auth
```

## Design tokens

`#0E0E11` background · `#1A1A1F` surface · `#FF5C7A` rose primary · `#F5F5F7` text ·
`#8E8E93` secondary · `#4ADE80` success · `#FF6B6B` error · 16px cards, 12px inputs,
full-rounded buttons · 24px mobile gutters · 200–250ms fade + 12px rise on entry.
