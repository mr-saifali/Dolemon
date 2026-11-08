# Dolemon · v0.1

A space for **one-to-one** conversations. No groups, no noise. Messages are protected by Supabase access controls, not end-to-end encryption.

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
and calls can ring another device while its app is active, subject to network and Realtime configuration.

Supabase project `dolemon` is provisioned (schema + RLS + presence tables) and its auth
site URL points at the live domain. See [DEPLOY.md](./DEPLOY.md) for env vars, how the
first builds were fixed, and the OTP/SMTP caveats before switching to real auth.

## Privacy and deployment limitations

- The documented `chat-media` bucket is **public**. Anyone with an attachment URL can access it. Deleting a message or chat does not remove its stored files. Check the actual bucket configuration before using sensitive media.
- App lock is a UI gate, not encryption. Local preferences and presence history are device-specific. New local secrets require Web Crypto; users with old weak fallback hashes should reset their password/app lock on HTTPS.
- Typing and presence controls stop future signals from this device; a previously shared last-seen timestamp may remain. App-wide online indicators require the private Realtime setup in [app presence setup](docs/app-presence.md). An untracked partner is not necessarily offline. Live room history is an incomplete, device-local observation, not an authoritative shared record. Legacy history is preserved but excluded because it could contain demo data.
- Live pulses and server-enforced blocking are not implemented. The lamp is local only. TURN relay, message E2EE and a durable offline outbox are also not implemented. Web Push requires explicit server setup and per-device opt-in; see [push setup](docs/push-notifications.md). Retry after an ambiguous failure may duplicate a message.
- Realtime calling uses DTLS-SRTP transport, but signalling needs private, authenticated Realtime policies and live two-account security testing before making an identity-authenticated end-to-end privacy claim. Calls may fail on restrictive networks and cannot ring a suspended app without push.
- Automatic local Doremon analysis is opt-in under Settings. Explicit questions and briefings can send recent excerpts and memory to Google Gemini; consider the other person's consent. Inferences can be wrong. Memory controls allow summary edits, JSON export and deletion of your copy (other devices may recreate it if analysis remains enabled).
- Migrations **004–015 are applied** on the provisioned project; see [migration status](docs/supabase.md#8-migrations--current-status). 011 replaces the original `set_account_visibility()`, whose argument shadowed the `profiles.visibility` column and silently no-opped — that is why **private accounts** could not be switched on. 015 tightens the message UPDATE policy and the RPC grants. Migration files are not applied by deploying the app, and 010 must not be rerun after 011: it reinstates the old foreign key and policy.
- The lockfile has known security advisories including Next.js and Zod; a major framework/dependency upgrade and deployment-specific validation remain necessary. CI and mocked tests are not a substitute for live RLS, storage, two-device and Gemini generation tests.

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
`.env.local` or your deployment environment. The model is hardcoded to
`gemini-3.1-flash-lite`, which returned a real test reply with this project's
preview key on 2026-11-06. `GEMINI_MODEL` is intentionally ignored. Never use a
`NEXT_PUBLIC_` prefix for the key. Demo mode uses the local heuristic brain.

Each question uses one generation request; Sunrise is a separate optional
request. Google enforces rate, token and daily limits, which can differ by
project and change over time; a successful test is not a guarantee of future
availability or free quota. A temporary HTTP 503 gets one retry of the same
model; other failures are not retried and no model fallback is used. If a quota
error occurs, check the project's quota and billing in Google AI Studio.
The public model-catalog diagnostic is disabled. AI generation requires a valid
Supabase login. The current client sends only fixed generic intent/language
labels and bounded partial per-day message counts; raw questions, messages,
names, code mappings and room Q&A are not sent to the external AI service.
Older clients can still send raw content to the application server, where it
is stripped before generation. The AI cannot interpret private chat details
under this design. Local keyword lookup searches only the loaded window and
is explicitly incomplete. New room history stores the latest five exchanges
on this device without encryption, scoped by account and conversation. Older
history may still exist in account memory until explicitly deleted. This is
not a security audit or a guarantee against all privacy risks.

Run the mocked API and theme tests with `node --test tests/*.test.cjs`.

## Onboarding flow

| Step | Route | What happens |
| --- | --- | --- |
| 1 | `/` | Welcome — "A private space for just you two." |
| 2 | `/signup/email` | Email entry, zod-validated |
| 3 | `/signup/verify` | OTP code (`NEXT_PUBLIC_OTP_LENGTH`, 8 on this project), auto-advance, auto-submit, 30s resend cooldown, 5-attempt cap |
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
- **Presence moments** can appear in the demo timeline. Live room observations are local to this device and are not a shared timeline.
- Bubbles with day separators (Aaj / Kal / 12 Nov), 3-minute grouping, delivery ticks
  (sending → server-accepted → read → failed + tap-to-retry), typing bubble, auto-growing
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

Pulses are available in the local demo only. Live mode does not claim to send them.

### The room (`/app/room/[id]`)

- Your two avatars with a live line between them, lit only when you're both in.
- **Leave a light on** — a warm glow on this device only.
- **Together today** — minutes you've shared, a 7-day chart and a streak, all from logged
  presence sessions observed on this device; they are incomplete and may overlap across tabs.
- **Presence moments** — the last few times you were both here, with times and lengths.

### Presence controls

`/settings` → Presence controls future presence publication from this device. Typing is a separate setting; turn both off if you do not want either signal shared. Last-seen timestamps already published can remain.

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

- **Message actions** — long-press a bubble to react, reply, copy or forward; edit and delete your own messages. Live deletion removes the message for both participants.
- **Attachments** — photos (downscaled to fit device storage) with a full-screen viewer, and
  voice notes recorded with MediaRecorder up to 60s with a live waveform.
- **Older messages & search** — load older pages in the thread or search text across accessible messages (up to 50 results).
- **Chat management** — long-press a row on home to pin, mute, mark read, or delete a chat.
- **Privacy controls** — read receipts, typing, presence, automatic analysis and haptics (Settings).

## Not built yet (deliberately)

| Gap | Why |
| --- | --- |
| End-to-end encrypted **messages** | Call media uses DTLS-SRTP, but signalling identity is not yet independently authenticated. Text is stored in Postgres under RLS, so it is encrypted in transit but readable by the project owner. Real message E2EE needs a key exchange per device |
| Push notifications | Opt-in Web Push; requires deployment configuration and a Supabase INSERT webhook. See [setup](docs/push-notifications.md). |
| Private media | Live attachments use public links; private storage and object cleanup need a migration |
| Full multi-device state | Messages sync, but preferences, themes, drafts and local room history do not |
| Block / report, backups | Server-authoritative features that follow the backend |
| Durable outbox | Unsent messages currently live in memory and do not survive reload |

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

### Connection and loading behavior

Live chats initially load the newest 80 messages; scrolling back loads older pages of 100. New messages use Supabase Realtime, with a lightweight five-second newest-message check while the chat is visible to recover from missed events. The inbox and a failed initial chat load refresh when the browser reports connectivity has returned. Read indicators rely on the read-cursor migration (005) and the other person's read-receipt setting; timestamps are best-effort, not proof of attention. The browser's online indicator is only a hint, not proof that the server is reachable.

In production the service worker caches a standalone offline page and a bounded set of Next.js static build assets. Navigations are network-first with a five-second timeout; if the network fails, the offline page explains how to retry. The worker does not cache private pages, API/RSC responses, messages, or uploaded media. The offline page is available only after a successful worker installation. Remote chats, calls, and delivery still require a connection: there is no persistent offline message queue or automatic resend, and a refresh can lose unsent messages. Local demo data follows its existing device-local storage behavior.

### Link previews and Instagram embeds

Chat links open their original address in a new tab. Cards display the domain and path without contacting the link target; “Load preview” sends that URL to this app's server and the linked site to request a title and description. The preview service checks destinations and redirects against private and reserved networks. The link target can see the server request; don't load previews for sensitive URLs. Instagram's optional in-app viewer loads Instagram only after tapping “Watch here.” Private, login-required, removed, or embedding-restricted posts may not play; use “Open on Instagram” instead.

### Videos

Videos up to 50 MB use a separate private, temporary Supabase handoff and device-local IndexedDB copies. Recipient download is manual, and the app attempts to remove the temporary copy after saving. Availability, expiry, scheduled cleanup and deployment requirements are described in [temporary video setup](docs/temporary-video.md). This is not end-to-end encryption; the existing public photo/voice/file storage behavior is unchanged.

### Android test app

The Android shell and debug APK build workflow are documented in [Android test app](docs/android-app.md). The APK loads the hosted website and does not include web push support. It is a test build, not a signed production release.
