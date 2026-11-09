# Changelog

## Chat interaction and live calling fixes (2026-11-08)

- Preserve composer focus during message long-press and reaction selection; add a
  scrollable 37-emoji range while keeping the original quick reactions.
- Movable, screen-bounded self-preview; connected peer name in the header only;
  tap video to hide/show header and controls. Reattach preview after upgrades and
  minimizing/restoring calls.
- Fix inverted camera enablement, reuse negotiated camera senders, support camera
  replacement/restart and Android busy-camera retry, and await receiver media
  before negotiating voice/video upgrades. Serialize signalling and handle glare.
- Migration 021 expands only the message reaction check constraint. No changes to
  API credentials, AI model/billing, RLS, storage, TURN servers or APK version.
- Browser WebRTC tests use synthetic media, not physical cameras or remote-network
  calls. Real Android/dual-device acceptance remains required; the existing
  STUN-only configuration still cannot guarantee calls on restrictive NATs.

## Unreleased — chat menu and contextual Doremon

- Clear intercepted chat slots on navigation to Doremon, Room, calls or inbox.
  Render menu/search/comparison/theme/confirmation overlays through body portals,
  outside transformed swipe containers; make the menu scrollable on short screens.
- With explicit in-app acknowledgement, send bounded conversation context and
  the actual question to Doremon. Restore short follow-up history and replace
  the generic-only prompt with useful, evidence-grounded companion behavior.
- Bound context JSON to 9,000 bytes / 16 selected excerpts / three short Q&A
  turns, retain 512 output-token caps, and reject concurrent same-account calls.
  Add a best-effort 12 requests/minute per-instance limiter; no silent AI calls
  on room opening, typing or local automatic analysis.
- Use an app-rendered sharing acknowledgement, not WebView's unsupported JS
  confirm default. Update privacy disclosures; paid access is not a privacy guarantee.

## Unreleased — chat swipe-back polish

- Keep the 100px right-swipe / 500px-per-second flick thresholds, with true
  finger-tracking rightward motion and no leftward overscroll.
- Preserve the inbox depth overlay; scope its context to the intercepted chat
  slot so directly opened chats safely return to `/app` instead of external history.
- Header back and swipe dismissal navigate only after the slide completes.
  Stop animations/timers on unmount, ignore duplicate dismissals, and restore
  the chat if a navigation request leaves it mounted. Reduced motion remains respected.
- Add component regression tests for completion ordering, flick/snap behavior,
  direct-entry navigation, unmount cleanup and blocked-navigation recovery.

## 1.4.1 — the Android app that behaves like an app

**A real swipe-to-refresh**
- Pulling down from the top of the inbox or a chat now reloads it in place. The gesture
  only arms inside the Android shell and only when the list is already at its very top, so
  it never fights scrolling; screens listen for `dolemon:refresh` and reload their own data.

**50 messages, then 50 more**
- A thread opens with the latest **50** messages (was 6) and each "Load older messages" tap
  fetches up to another 50 (or the remaining history).

**The chat keeps up with fast typing**
- Message objects are reused when nothing about them changed (`lib/thread-identity.ts`), so
  polling every five seconds, an incoming message, or a reaction no longer re-renders every
  bubble. Typing pings are throttled to one every 1.5 s instead of one per keystroke. The
  simultaneous typing/incoming-message workload is reduced; physical-device stress testing is still required.

**No more web-page tells**
- The spinning loader behind every private screen is replaced by a still launch screen, and
  the route skeletons are now plain frames.
- Inside the shell, CSS drops the grey tap flashes, text-selection handles, long-press
  call-outs, rubber-band overscroll and scrollbars. Inputs stay selectable.
- The Android shell adds a centred-icon splash, dark status/navigation bars, no pinch or
  double-tap zoom, no overscroll glow, no scrollbars and `textZoom` pinned at 100%.
- The "…" menu's panels (search, compare, chat background) are part of the chat bundle now —
  a failed lazy-chunk load used to make those menu items do nothing in the app.

**Permissions, once**
- On the first arrival in the inbox the shell asks for camera, microphone and notifications
  in Android's own dialogs and remembers that it asked — never again after a denial.
- Notifications get a real channel, and `DolemonAndroid.notifyMessage(title, body)` lets the
  running shell post a system notification (the WebView has no Push API, so this covers a
  message that arrives while you are not looking at that screen).

**The app picks up merged fixes by itself**
- `/api/app-version` returns a per-build id; `ShellChrome` compares it with the bundle it is
  running and re-opens the site when a newer build is live and the app has been in the
  background for a while. A WebView left open for days no longer keeps stale JavaScript.

**English, not Hinglish**
- "Just the two of you", "Say it kindly", "Doremon is thinking" and the push body are all
  English. Doremon still speaks Hinglish *in character*.

**Android 1.4.1**
- versionCode 6 / versionName 1.4.1, published as `public/downloads/dolemon-test-1.4.1.apk`
  by the workflow. 1.4.0 and older now see the in-app update notice.
- The workflow reads `versionCode`/`versionName` from `build.gradle`, so a version bump is
  the only edit a release needs.


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
