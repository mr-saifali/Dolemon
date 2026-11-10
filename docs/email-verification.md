# Email verification and recovery

## App flow

- Live signup: email → password → email verification → handle. `signUp` is called
  once; confirmation resends use `auth.resend({ type: "signup" })`.
- Verification accepts `verifyOtp({ type: "signup" })`, requires a real verified
  session and refreshes the account before routing. A client-side draft is never
  treated as proof. Auto-confirmed sessions fail closed if the server is misconfigured.
- Default Supabase confirmation links also work: the email redirect returns to
  `/signup/verify`, and the verified session can continue even in a new browser.
- Recovery at `/recover` uses email sign-in with `shouldCreateUser: false`, followed
  by `verifyOtp({ type: "email" })` or a link to `/recover/password`. A verified
  server user is required before password update. Never put passwords in draft storage.
- Supabase OTP length is 8. The UI defaults to 8 (`NEXT_PUBLIC_OTP_LENGTH` may override
  only if changed to match the provider). Resend cooldown is 60 seconds; provider
  limits are authoritative. The local demo has no real email and is labelled as such.

## Exact production configuration change

Existing project: **lakgolufbudlyaepkehh**. Change only `mailer_autoconfirm` from
`true` to **false** after deploying this flow. Preserve email auth, signup, site URL,
redirect allowlist, JWT lifetime and refresh-token settings. Read back the setting.
This enables email confirmation; it does not retroactively verify ownership of
accounts previously auto-confirmed. No existing user rows or passwords are modified.

## Owner setup required for public OTP delivery

The audit readback found `smtp_host = null`, a 2-emails/hour built-in sending limit,
8-digit OTPs and link-only default confirmation/magic-link templates. Supabase's
built-in sender is not a public-production mail service and can restrict delivery
to organization-authorized addresses. **Do not launch public onboarding until a
custom SMTP service is configured and real deliveries succeed.**

The connected management tool exposes the confirmation toggle, but not SMTP or
email-template updates. Configure these securely in Supabase Dashboard; never put
SMTP passwords in chat, Git, frontend environment variables or source files:

1. Authentication → email/SMTP settings: configure an owner-controlled SMTP sender
   with a verified sending domain. Configure SPF/DKIM and preferably DMARC with
   your mail provider. Choose suitable sending limits and monitor bounces.
2. Authentication → email templates → **Confirm signup** and **Magic link**: include
   the numeric code as well as a link. Example content:

   ```html
   <h2>Your Dolemon verification code</h2>
   <p>Enter this one-time code in Dolemon:</p>
   <p style="font-size:28px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
   <p>Or <a href="{{ .ConfirmationURL }}">continue securely</a>.</p>
   <p>Never share this code. If you did not request this email, ignore it.</p>
   ```

3. Keep OTP length 8; review expiry (audit readback: 3600 seconds) and rate limits.
   The app does not claim a shorter expiry than the server actually enforces.
4. Test a new owner-controlled mailbox: correct/wrong/expired code, resend cooldown,
   sign-in rejection before verification, verified password sign-in, existing-email
   signup, recovery without user creation, spam placement, and links opened in a
   different browser. Repeat inside Android. Do not use real users' inboxes as tests.

Until that setup, link fallback is implemented, but **numeric OTP email delivery is
not end-to-end verified or launch-ready**. Existing password sign-in is unaffected.

## Mocked browser integration regression

With browser test dependencies installed as in `call-verification.md`, start a
local test server (dummy values only):

```sh
NEXT_PUBLIC_AUTH_MODE=supabase \
NEXT_PUBLIC_SUPABASE_URL=https://auth-test.invalid \
NEXT_PUBLIC_SUPABASE_ANON_KEY=test-public-key npm run dev
# In a second terminal:
BROWSER_TEST_MODULES=/tmp/dolemon-browser node tests/browser-live-signup-mock.mjs
```

The script intercepts **every** request to the dummy provider. It verifies a wrong
code is rejected, a subsequent valid code can be entered, signup is sent once and
verification does not fall back to password sign-in. Never deploy these dummy env
values or treat the result as evidence of real email delivery.
