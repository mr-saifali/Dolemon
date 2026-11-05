# Dolemon · v0.1

A private, invite-only space for **one-to-one** conversations. No groups, no noise.

Installable: open [dolemon.vercel.app/download](https://dolemon.vercel.app/download) →
**Install the app**. It lands on the home screen and runs full screen, no app store
involved. Release notes live in [CHANGELOG.md](./CHANGELOG.md).

Mobile-first (designed at 390px) and centred `max-w-md` on desktop.

## Live

**[dolemon.vercel.app](https://dolemon.vercel.app)** — production deploy of `main`,
running on Supabase: email + password accounts (no inbox needed) and real 1:1 threads
synced over Realtime.

Open the app → create an account → search your person by **@handle** → the room opens. Both
people need an account; messages, reactions, typing dots and presence are live between them,
and voice/video calls ring the other device directly.

Supabase project `dolemon` is provisioned (schema + RLS + presence tables) and its auth
site URL points at the live domain. See [DEPLOY.md](./DEPLOY.md) for env vars, how the
first builds were fixed, and the OTP/SMTP caveats before switching to real auth.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

No backend needed to click through onboarding: without Supabase keys the app uses a
self-contained local provider, and the emailed code is shown on the verify screen
(any code also accepts `123456` in demo mode).

## Doremon and Gemini free tier

For AI replies in live (Supabase) mode, set the server-only `GEMINI_API_KEY` in
`.env.local` or your deployment environment. The default model is
`gemini-2.5-flash-lite`; an existing `GEMINI_MODEL` environment variable
**overrides** that default. To use the lighter model on an existing deployment,
set `GEMINI_MODEL=gemini-2.5-flash-lite` there and redeploy. Never use a
`NEXT_PUBLIC_` prefix for the key. Demo mode uses the local heuristic brain.

Each question normally makes one generation request; Sunrise is a separate,
optional request. If the default model is missing or Google explicitly reports
zero free quota for it, Doremon checks the model catalog and can try one known
alternative. Ordinary rate limits, timeouts and other errors are not retried. A timeout can still consume
quota even if no reply arrives. Google enforces per-project/model rate, token,
and daily limits, and availability can differ by account and change over time.
If you see a quota message, wait for the indicated retry time, or check your
project's quota and reset time in Google AI Studio. A daily limit or a model
with no free quota cannot be fixed by retries. If the model is unavailable,
choose a model with free-tier generation access and set `GEMINI_MODEL` to its
exact ID. `/api/doremon?models=1` lists models visible to the key, but the list
and room status check do not guarantee free quota. No generation is spent on
that check. AI generation requires a valid Supabase login, protecting the shared
Gemini quota from anonymous callers. Conversation data sent to Gemini includes the recent chat, a
compressed memory, and up to four recent private room exchanges.

Run the mocked API and theme tests with `node --test tests/*.test.cjs`.

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

A quiet greeting, one **+**, and a **search field** that finds real people by handle
(`search_users()` in Postgres, two characters or more, your own row excluded). Matches drop
down under the field — tap one and the room opens.

With no conversations yet the screen is an invitation, not an error page: two slowly orbiting
rings inside a breathing rose glow, *"It's a little quiet here."*, and a gradient
**Invite your person** button with a soft pulsing shadow. **How it works** opens a three-step
explainer. Below that, the 1:1 list with unread badges, online dots and "typing…" once people
are talking.

## Chat thread (`/app/chat/[id]`)

Built around **presence**, not around an inbox:

- The room is a place you are both *in*. When you both are, the ambient rose light comes up,
  the header reads "You're both here · 4m" with a shared clock, and a hairline ribbon under
  the header comes alive. When one of you leaves, the light drops and the composer quietly
  says "Aarohi left 2m ago — your message will be waiting."
- **Presence moments** are timeline items in their own right ("You were both here together
  yesterday · 22 minutes") — something a normal chat log can't show.
- Bubbles with day separators (Aaj / Kal / 12 Nov), 3-minute grouping, delivery ticks
  (sending → sent → delivered → read → failed + tap-to-retry), typing bubble, auto-growing
  composer (Enter to send, Shift+Enter for a newline).
- Auto-scroll only pins when you're within 120px of the bottom; scroll up and new messages
  collect behind a `↓ N naya` pill instead of yanking you away from what you were reading.
- Demo partner replies ~3.4s after you send and presence drifts in and out every 18s so the
  layer is visible; "Reset demo thread" lives in the chat menu.

Presence lives in `lib/presence.ts` with a single seam to a realtime channel — see
`docs/supabase.md` §4 for the Realtime + `presence_moments` mapping.

### Chat backgrounds

Pick a default under **Settings → Chat backgrounds**, or open a chat's **… →
Chat background** to give that chat its own look. Choose Soft glow, Open sky,
Wild coast, Golden road, Sky garden, Aurora dream, or Endless horizon; “Use my default” removes the individual override.
These choices are saved on this device only and are not shared with the other
person. The original backgrounds are bundled with the app.

### Five reactions, no emoji

Dolemon doesn't use unicode emoji. The five reactions are hand-drawn SVG components in
`components/reactions/` — **Dil** (heart), **Haha** (laughing face), **Wow** (wide eyes),
**Aww** (welling up), **Hype** (flame) — each 28×28, flat with one gradient, no outlines,
and still distinguishable at 16px in a chip.

- **Long-press** a bubble (300ms) → the five faces + Reply / Copy / Forward / Delete float
  above it. Delete only appears on your own messages.
- **Double-tap** → Dil lands: a 72px heart rises out of the bubble (scale 0.6 → 1.4,
  y −40px, 700ms). Double-tap again and it's taken back.
- One reaction per person per message. Chips sit −8px under the bubble, aligned to its
  side, with your own highlighted in rose. Tap your chip to remove it; tap theirs and it
  says "Aarohi ne Dil kiya" instead of silently toggling.
- Reactions are modelled in `lib/reactions.ts` and persist per thread; the same shape is
  stored in `message_reactions` in Supabase (see `docs/supabase.md` §7).

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

## Calls — real WebRTC

Voice and video calls are **live peer-to-peer WebRTC**. `LiveCallProvider` (root layout)
subscribes to a personal channel `user:<id>`, so a call can ring you on any screen; the
offer/answer and ICE candidates travel on `call:<conversationId>`. STUN only, no TURN — two
mobile networks behind symmetric NAT can occasionally fail to meet, and the UI says so.

- **Encryption:** media is DTLS-SRTP, negotiated directly between the two browsers. The
  moment ICE connects the overlay reads *"Encrypted · phone to phone"* — that line comes from
  `pc.getStats()` reporting `dtlsState: "connected"`, not from a promise. Supabase relays only
  signalling (invite, SDP, ICE); it never receives audio or video.
- Incoming ring, accept/decline, mute, camera on/off, flip camera, live timer, and a
  `Voice call · 4m 12s` / `Missed voice call` pill written back into the thread.
- `/app/call/[id]?kind=voice|video` still works as a deep link: it starts the call and drops
  you back into the room, with the full-screen overlay on top.

The local demo keeps the simulated call screen (no media) for click-through.

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
| End-to-end encrypted **messages** | Calls are E2EE (DTLS-SRTP, peer to peer). Text is stored in Postgres under RLS, so it is encrypted in transit but readable by the project owner. Real message E2EE needs a key exchange per device |
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
