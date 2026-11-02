# Dolemon

A private, invite-only space for **one-to-one** conversations. No groups, no noise.

Mobile-first (designed at 390px) and centred `max-w-md` on desktop.

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

Plus `/signin`, `/app` (chat home), `/app/chat/[id]` (thread placeholder),
`/settings` (avatar + app password), `/unlock`.

## Home screen (`/app`)

Greeting + handle, account avatar → settings, live search across names/handles/messages,
All / Unread filters, and a 1:1 conversation list with unread badges, online dots,
"typing…", pinned and muted states. Tapping a row opens the thread; the rose FAB opens
the new-chat sheet with your invite link. In demo mode the list is sample data
(labelled as such); with Supabase configured it renders real rows once the backend lands.

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
