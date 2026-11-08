# Web Push setup

Push is opt-in per device. It works for live Supabase accounts over HTTPS on browsers that support Web Push; on iPhone/iPad, iOS/iPadOS 16.4+ requires installing Dolemon to the Home Screen and enabling notifications from that installed app. Browser/OS permissions, battery policies, network and push provider availability still affect delivery. Demo mode has no server delivery. Only a generic “You have a new message” notification is sent, without the sender or message text. This is not an end-to-end encrypted messaging system.

## How it fits together

```
messages INSERT
  └─ trigger notify_push_webhook()  (security definer, pg_net)
       └─ POST https://dolemon.vercel.app/api/push/message
            header: x-dolemon-webhook-secret  ← read from push_webhook_config
            body:   { type, schema, table, record: { id } }
              └─ route forwards the header into push_delivery_targets()
                   └─ the DATABASE checks the secret, excludes the sender,
                      claims the event once, returns the partner's subscriptions
                        └─ route signs with VAPID and posts to the push service
```

No `SUPABASE_SERVICE_ROLE_KEY` and no shared secret live in Vercel. The only
server-side secrets are the VAPID pair.

## Deployment

1. **Schema.** Apply `docs/migrations/012_push_notifications.sql`, then
   `docs/migrations/019_push_webhook_auth.sql` (both applied on the `dolemon`
   project). 019 installs `pg_net`, `push_webhook_config`,
   `push_delivery_targets()`, `push_forget_subscription()` and the
   `messages_push_webhook` trigger. Check RLS with two accounts: each must see
   and modify only their own subscriptions, and neither can read
   `push_notification_events` or `push_webhook_config`.
2. **VAPID keys.** Generate one keypair and keep it forever — rotating it
   invalidates every existing subscription. A pair generated for this repo sits
   in `.env.push.local` (git-ignored, never committed). Add these three to
   Vercel → Settings → Environment Variables (Production, Preview, Development)
   and redeploy:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key |
   | `VAPID_PRIVATE_KEY` | the private key (secret) |
   | `VAPID_SUBJECT` | a `mailto:` contact |

   Do not put the private key in `NEXT_PUBLIC_*`, in this file, or in chat. To
   mint a fresh pair instead: `npx web-push generate-vapid-keys`.
3. **Verify configuration.** `GET /api/push/status` returns
   `{ "configured": true }` once the three variables are live. The Settings
   screen refuses to subscribe until it does.
4. **Verify the webhook.** Send a message between two accounts and check:

   ```sql
   select status_code, error_msg, created
     from net._http_response
    order by created desc
    limit 5;

   select message_id, created_at
     from public.push_notification_events
    order by created_at desc
    limit 5;
   ```

   A `401` means the header secret did not match `push_webhook_config`; a row in
   `push_notification_events` without a delivered notification means the push
   provider or endpoint rejected it (check the function logs).
5. **End to end.** On two accounts/devices enable **Settings → Notifications**,
   allow permission, close the recipient app, and send a message. Verify the
   generic notification arrives and opens the correct chat. Test iOS Home
   Screen and Android separately. Disabling it and signing out should remove the
   device subscription.

Rotating the webhook secret is one statement — the trigger reads it on every
insert:

```sql
update public.push_webhook_config
   set secret = encode(gen_random_bytes(32), 'hex');
```

## Limits

A successful subscription alone does **not** prove the webhook or delivery work.
Push is best effort: the provider, webhook, device, or network can fail;
deduplication avoids duplicate sends but transient errors after a claim are not
retried. The existing per-conversation mute setting is device-local and does not
suppress server push. Sign-out attempts to unsubscribe the current device, but
network failures can leave a stale server row until it expires. No cross-device
notification preferences or delivery receipts are provided.
