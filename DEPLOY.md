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
| Auth mode on Vercel | **demo** — no env vars set, so the local provider runs (OTP printed on screen) |
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

The project currently has **no env vars**, which is intentional: without
`NEXT_PUBLIC_SUPABASE_URL` + anon key the app uses the local provider and nothing breaks.

To point the live app at Supabase, add these four (they can be added through the
Arena Vercel connector, or in the dashboard → Settings → Environment Variables → Production):

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lakgolufbudlyaepkehh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | project anon key (Supabase → Settings → API keys) |
| `NEXT_PUBLIC_OTP_LENGTH` | `8` (matches `mailer_otp_length` on this project) |
| `NEXT_PUBLIC_AUTH_MODE` | `demo` for the UI demo, `supabase` for real auth |

`NEXT_PUBLIC_*` values are baked in at build time, so a **redeploy is required** after
changing them. Any browser can also flip itself back to demo mode with the
`dolemon:auth-override` key or the link on `/signin`.

## Before switching `NEXT_PUBLIC_AUTH_MODE=supabase`

Supabase email OTP needs three dashboard changes that the API connector can't make:

1. **Email template** — Authentication → Email Templates → *Confirm signup* / *Magic Link*
   must include `{{ .Token }}` (the default only carries `{{ .ConfirmationURL }}`, so
   there is no code to type).
2. **SMTP** — the built-in sender is capped at **2 emails/hour**. Add Resend/Postmark/SES
   before real use.
3. **OTP length** — the project is set to **8** (`mailer_otp_length`); keep
   `NEXT_PUBLIC_OTP_LENGTH` in sync or verification will fail.

Until those are done the live app runs in demo mode — nobody gets stuck at a missing email.

## Deploying changes

The Vercel project currently has `gitProviderOptions.createDeployments = "disabled"`,
so **pushing to `main` does not auto-deploy**. Two options:

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
