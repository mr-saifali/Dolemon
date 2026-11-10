# Deploying Dolemon

## Current state — live ✅

| Piece | Status |
| --- | --- |
| **Live app** | **https://dolemon.vercel.app** |
| Supabase project | ✅ `dolemon` · ref `lakgolufbudlyaepkehh` · ap-south-1 (Mumbai) |
| Database schema | ✅ profiles, RLS, `username_available`, app-lock RPCs, presence tables |
| Supabase auth site URL | ✅ `https://dolemon.vercel.app` |
| Vercel project | ✅ `dolemon` · `prj_1O9Q0xc3AYVTMEfY05q3rje2xhzv` · team `fairtok` |
| Framework preset | ✅ `nextjs` (this is what the first builds were missing) |
| Vercel domains | `dolemon.vercel.app` (verified), `dolemon-fairtok.vercel.app`, `dolemon-git-main-fairtok.vercel.app` |
| Auth mode on Vercel | **supabase** — password signup followed by email verification |
| Messaging | live: `conversations` / `messages` / `message_reactions` + Realtime |
| Deployed commit | `a5f3bd1` on `main` |

The app is fully clickable live: welcome → email → OTP → password → username → `/app`
→ chat → room → call, all against the local provider.

## Why the first two builds failed

The Vercel project was created with **`framework: null`**, so Vercel treated the Next.js
app as a plain static site and aborted with:

```
Error: [STATIC_BUILD_NO_OUT_DIR] No Output Directory named "public" found after the Build completed.
```

`next build` itself compiled all 13 pages successfully — the code was never the problem.
Fixing the framework preset to `nextjs` made the deploy go green.

## Environment variables

These four are set on the Vercel project (Production + Preview). Without the Supabase pair
the app silently falls back to the device-local provider, so nothing breaks — but real
chat needs them:

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lakgolufbudlyaepkehh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | project anon key (Supabase → Settings → API keys) |
| `NEXT_PUBLIC_OTP_LENGTH` | `8` (matches `mailer_otp_length` on this project) |
| `NEXT_PUBLIC_AUTH_MODE` | `demo` for the UI demo, `supabase` for real auth |

`NEXT_PUBLIC_*` values are baked in at build time, so a **redeploy is required** after
changing them. Any browser can also flip itself back to demo mode with the
`dolemon:auth-override` key or the link on `/signin`.

## How signup works now

Live signup is **email → password → verify email → handle**. Set
`mailer_autoconfirm = false`. Password sign-in still works for existing verified
accounts; unverified accounts cannot skip the email step. Signup never falls back
to signing into an existing account. Recovery verifies the mailbox without creating
a new user. See [email verification setup](docs/email-verification.md).

The existing project has no custom SMTP configured and default link-only templates.
**Public email delivery and numeric OTP messages are release blockers until the
owner configures SMTP and adds `{{ .Token }}` to confirmation and magic-link
messages.** The app supports the default verification link as a fallback.

## Deploying changes

Verify the Vercel deployment state after every merge rather than assuming a push
has gone live. Recent merges have triggered Git deployments. If automation is
unavailable, deploy the exact merged commit using the existing project. Options:

- Turn on automatic deployments in Vercel → Project → Settings → Git, then every push to
  `main` ships; or
- Ask me to trigger a deploy from the connector (that is how `dpl_8NrUKy6RUwRbknB4GWXp6d5BxcRg`
  was created).

## Domains

`dolemon.vercel.app` is attached to the project and verified. A real domain
(e.g. `dolemon.app`) can be attached later — add it in Project → Settings → Domains and
point the DNS record at Vercel.

## Performance note

The serverless functions run in `iad1` (Washington DC). For users in India, changing the
function region to `bom1` (Mumbai) in Project → Settings → Functions will noticeably cut
chat latency; the Supabase database is already in `ap-south-1`.
