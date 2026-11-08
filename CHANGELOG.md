# Changelog

## Backend — privacy repairs (Supabase)

**Private accounts work again**
- `set_account_visibility()` from migration 004 was a silent no-op: its `visibility`
  argument shadowed the `profiles.visibility` column, so the Settings toggle always
  failed its "did it stick?" check. Migration 011 installs the positional (`$1`)
  version, and 004 now ships the fixed definition so re-running it cannot regress.

**Migrations 010–015 applied**
- Doremon's room: per-user, deletion-proof memory plus `doremon_stats()` and
  `doremon_records()`. Legacy shared memory was copied to both members.
- Push subscription and webhook-dedupe tables (server env still required).
- Temporary video registry plus the private `temporary-chat-videos` bucket.
- Private `app-presence:<conversation>` Realtime policies for the online indicator.
- Hardening: a message UPDATE must keep the sender inside the target conversation;
  `anon` can no longer execute app RPCs through the default PUBLIC grant;
  TRUNCATE/REFERENCES/TRIGGER revoked from `anon` and `authenticated`.

**Chat media is private (016–017)**
- Photos, voice notes and files are stored as `dolemon-media:<path>` references and resolved
  with one-hour signed URLs (`lib/media-url.ts`, `lib/use-media-url.ts`), cached per object.
- The bucket has a 25 MB server-side limit and a members-only read policy. Migration 017
  rewrites historical public URLs and flips the bucket private — run it after the signed-URL
  build is live.
- Signed URLs are cleared on sign-out, and the offline snapshot signs before downloading.

**Push works without a service-role key (019)**
- `pg_net` fires a `messages` INSERT webhook; the secret lives in `push_webhook_config` and
  the route only forwards it back into `push_delivery_targets()`. Deduplication, sender
  exclusion and recipient lookup moved into the database.
- Only the VAPID pair remains as server configuration (`/api/push/status` reflects it).

**Cleanup that actually runs (020)**
- `/api/video/cleanup` worked again after dropping its service-role requirement; expired
  temporary videos are deleted through the Storage API.
- New `/api/media/cleanup` removes chat-media objects whose conversation is gone — the anon
  key is enough because the policies only expose already-unreachable files.

**Presence memory integrity (018)**
- A presence moment can only name someone you share a conversation with, so one account can
  no longer write forged "you were both here" rows into a stranger's history. Owners can
  delete their own moments.

## 0.1 — First light

The first version you can actually keep on a home screen.

**Installable**
- Web app manifest + service worker: installs to the home screen, opens full screen with
  no browser chrome, survives a dead network for the shell.
- Download surface: a **Download the app** button on the landing page, a `/download` page
  with per-platform steps, and an "Install the app" row in settings.
- Real app icon (192 / 512 / maskable / apple-touch), theme colour `#09090B`.

**Talking**
- Phone-to-phone WebRTC voice and video calls, now with an iOS-flavoured call screen:
  glass controls, a self-view picture-in-picture, live duration, and a red end-call key.
- Minimise a call into a floating pill so the chat stays usable while you talk.
- Speaker routing when the browser supports `setSinkId`; muted/camera-off states are
  unmistakable.

**Feel**
- Swipe a bubble right to quote it; the thread springs into place instead of jumping.
- Messages that are already on screen when a thread opens no longer animate in, so long
  threads paint instantly.
- Removed every large `blur` layer and per-frame backdrop blur from scrolling surfaces;
  glow is painted with gradients, motion is composited transforms only.
- `prefers-reduced-motion` respected app-wide.
- Vibrant pass: gradient type, hairline gradient borders, coloured settings tiles, tinted
  reaction row, gradient bubbles and switches.

**Profile**
- Upload a real profile photo (compressed to 720px, stored in Supabase Storage), shown in
  the inbox, chat header, people search and on calls.
- Settings is reachable again from the inbox (tap your avatar).
