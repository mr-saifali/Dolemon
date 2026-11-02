# Deploying Dolemon

## Current state

| Piece | Status |
| --- | --- |
| Supabase project | ✅ `dolemon` · ref `lakgolufbudlyaepkehh` · ap-south-1 (Mumbai) |
| Database schema | ✅ profiles, RLS, `username_available`, app-lock RPCs, presence tables |
| Vercel project | ❌ blocked — the connected Vercel token has no write/team scope |
| Public URL | ❌ not yet — needs the Vercel project |

## 1. Fix the Vercel connection

The Arena Vercel connection can currently **read** (projects, deployments, user) but every
write returns:

> Access denied. Your token may not have the required permissions.
> The account lacks permission for this action or scope.

Fix one of these:

- **Arena → Settings → Connections → Vercel → Reconnect**, approving the full scope
  (project + deployment + domain), then tell me and I'll finish the deploy; **or**
- Create a token at <https://vercel.com/account/tokens> with **Full Account** access and
  reconnect with it.

## 2. Create the project + deploy

Once access works, this is all that's left (I can run it):

```bash
# project linked to the GitHub repo, framework preset = nextjs
vercel link --project dolemon --yes

# production env vars
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add NEXT_PUBLIC_OTP_LENGTH production       # 8
vercel env add NEXT_PUBLIC_AUTH_MODE production        # demo | supabase

vercel deploy --prod
```

### Environment variables

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lakgolufbudlyaepkehh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | project anon key (Supabase → Settings → API) |
| `NEXT_PUBLIC_OTP_LENGTH` | `8` (matches `mailer_otp_length` on this project) |
| `NEXT_PUBLIC_AUTH_MODE` | `demo` for a UI demo, `supabase` for real auth |

## 3. Domain

`dolemon.vercel.app` is a **shared Vercel subdomain** — it is already likely claimed by
another account, in which case Vercel issues something like `dolemon-<hash>.vercel.app`.
A real domain (e.g. `dolemon.app`) can be attached later with `vercel domains add`.

## 4. Before switching `NEXT_PUBLIC_AUTH_MODE=supabase`

Supabase email OTP needs three dashboard changes that the API connector can't make:

1. **Email template** — Authentication → Email Templates → *Magic Link* must include
   `{{ .Token }}` (the default only has a link, so there's no code to type).
2. **SMTP** — the built-in sender is limited to **2 emails/hour**
   (`rate_limit_email_sent = 2`). Add Resend/Postmark/SES for real use.
3. **OTP length** — the project is set to **8** (`mailer_otp_length`); the app reads
   `NEXT_PUBLIC_OTP_LENGTH`, so keep the two in sync.

Until those are done the live app runs in demo mode — the sign-in screen has a
**"Is device par demo mode se kholo"** link so nobody gets stuck at a missing email.
