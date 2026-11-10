# Trust / investor-readiness audit — web 1.5.0

Scope: source review of authentication, account flows, settings, invitation routes,
API ingress, cache lifecycle, Android WebView navigation/permissions/bridge,
dependency advisories, read-only Supabase auth/RLS/storage metadata, automated
regression tests and local mobile Chromium smoke. This is **not a full penetration
test, legal review, all-network call certification or physical Android acceptance**.

## Concrete findings fixed

| Risk | Remediation |
| --- | --- |
| Signup accepted unverified mailboxes and could silently sign into an existing account | Require confirmation before profile setup; no password-login fallback from signup; unverified server users rejected; configuration readback at rollout |
| UI expected six digits while provider sends eight; full-code paste truncated; duplicate submit possible | Eight-digit default, accessible dynamic label, full-code paste/autofill and synchronous in-flight guard |
| Lost passwords had no recovery path | Mailbox-verified recovery that never creates a new account; ownership checked before password update |
| Advertised invitation links returned 404 | Safe `/u/[username]` landing; no anonymous profile lookup or automatic chat creation |
| Cache clear erased settings/demo accounts but not an already-open chat database | Close the IDB handle before deletion; clear only recent cached chats and cached pages; preserve login, prefs and saved videos |
| Sign-out failures were ignored | Surface error instead of claiming success or clearing the UI while provider session survives |
| Stale offline/push/version/invite-only claims, no visible data handling explanation | Correct copy, separate web/APK versions, link factual `/privacy` notice from signup/sign-in/settings/invitations |
| Old framework/validation/transitive dependencies had known advisories | Patched Next 15.5.29, Zod 4.6.7, compatible lint/resolver, PostCSS/minimatch overrides; unused SSR package removed; full npm audit clean at validation |
| Chunked bodies could bypass Content-Length-only checks | Streamed byte/time limits for preview and push; malformed/null JSON rejected |
| Media cleanup ignored configured cron authentication | Same optional constant-time bearer check as video cleanup; no storage SQL deletes |
| Crash route offered no recovery; browser magnification disabled | Retry/inbox error boundary; allow zoom; baseline nosniff/referrer/unused-permission headers |
| Invalid/cleared usernames could display stale availability | Invalidate outstanding handle lookups on every change |

Read-only backend checks: all 12 public tables have RLS enabled; sensitive push
configuration/event tables deny anon/authenticated table access; examined profile,
message and reaction policies are ownership/membership gated. Chat-media and
temporary video buckets are private (25 MiB / 50 MiB), avatar bucket public (4 MiB).
This metadata review is not a two-account adversarial RLS test. No policies,
grants, storage data, existing accounts, API credentials or AI/billing settings changed.

## Remaining release gates — do not hide these from users/investors

1. **Email delivery:** no custom SMTP or visible-code templates. Owner must configure
   SMTP and `{{ .Token }}` in confirmation/magic-link templates and verify actual
   inbox delivery. See `email-verification.md`. Enabling confirmation alone is not
   a public delivery solution. Previously auto-confirmed accounts were not reverified.
2. **Official Android release:** current APK is debug-signed 1.4.1, not Play Store or
   owner-release signed. Establish persistent owner signing/backup and test in-place
   upgrades. No signing keys are generated or stored by this change. Hosted fixes
   reach the current shell after reopening online; no new binary is required here.
3. **Device/network acceptance:** test two real phones, actual mailboxes, media
   codecs/permissions, camera flips, keyboard, downloads, backgrounding and upgrades.
   Chromium tests use synthetic media and/or mocks, not production accounts.
4. **Call reachability:** configure an owner-controlled TURN service for restrictive
   NAT/firewalls. Existing STUN-only calls cannot promise universal connectivity.
5. **Closed-app Android notifications:** native FCM integration and owner Firebase
   setup are still needed. Running-shell notifications and supported browser push
   are different features; do not sell them as closed-app Android push.
6. **Abuse, deletion and operations:** blocking/reporting, safe self-service account
   deletion/export, support contact, abuse response process, operator-authored legal
   terms/privacy policy and retention rules remain production gates. This audit does
   not invent a support mailbox, moderation team or compliance guarantee. Do not
   silently add destructive account deletion without defined media/retention rules.
7. **Data protection:** server-stored chat text and device caches are not E2EE or
   separately encrypted. App lock is a UI gate; AI sharing is external processing.
   A full protocol/storage redesign and independent assessment would be required
   before claiming audited secure messaging. Keep the test-release disclosure.

## Rollout evidence

Run `npm ci`, lint, typecheck, all Node tests, build and `npm audit` with the committed
lockfile. Optional synthetic media/keyboard browser scripts are documented in
`call-verification.md`. Public routes, OTP paste/local signup and security headers
were also checked at a 360px mobile viewport. The live-provider UI flow was
browser-tested with all Supabase requests intercepted: email → password → wrong
OTP (rejected) → valid OTP → username, with one signup and no password-login
fallback. This is mocked integration coverage, not real inbox delivery. Record exact PR/merge/deployment and
confirmation-setting readback in the PR rollout comment. No real email was sent
and no production account or conversation content was inspected in this audit.
