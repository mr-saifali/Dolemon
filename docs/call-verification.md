# Chat and call regression verification

## Automated checks

`node --test tests/*.test.cjs`, `npm run lint`, `npm run typecheck`, and
`npm run build` must pass. The component tests cover call chrome toggling, the
header-only video peer name, draggable preview configuration, video mount/restore
attachments, and keyboard-aware message interaction. Media unit tests cover null
senders, negotiated-transceiver preference, restart, flip, device-busy retry,
permission denial and abandoned capture cleanup.

Optional Chromium checks use no real accounts or physical cameras. Install browser
tools outside the repository (not production dependencies):

```sh
npm install --prefix /tmp/dolemon-browser --no-audit --no-fund puppeteer-core @sparticuz/chromium
# Start npm run dev (or npm run build && npm run start) separately.
BROWSER_TEST_MODULES=/tmp/dolemon-browser node tests/browser-call-media.mjs
BROWSER_TEST_MODULES=/tmp/dolemon-browser node tests/browser-chat-keyboard.mjs
```

Use `TEST_BASE_URL` to override http://localhost:3000. Chromium may require OS
shared libraries on minimal Linux images. The keyboard script seeds **demo local
storage**: run it against a local build with demo mode, not a real account.

The WebRTC script connects two actual Chromium RTCPeerConnections using synthetic
canvas/audio media. It checks received frame counters on both sides after an
incoming-side voice→video upgrade, off/on, camera replacement on each side, and a
second voice→video upgrade. This verifies media/sender negotiation, **not** real
Supabase signalling delivery or connectivity between different networks. The
keyboard test verifies focus, draft and selection, not physical keyboard rendering.

## Physical-device acceptance still required

With two signed-in accounts, preferably on different networks:

1. Type a draft, hold a message, expand emoji, and choose a reaction. Confirm the
   keyboard stays open, draft/caret stays unchanged, and the peer receives it.
2. Make/receive a video call; drag self-preview around all edges. Tap the remote
   video to hide all header/name/control chrome; tap again to restore it.
3. On **each** phone turn camera off, back on, then flip twice; confirm the peer
   receives moving video. Minimize and restore; confirm both video and audio.
4. Start a voice call. Upgrade from either end; allow camera permission if asked.
   Confirm bidirectional moving video. Return to voice and upgrade again.
5. Deny camera permission, end while permission is pending, then retry. Confirm
   clear notices and no abandoned camera capture. Repeat on the Android WebView.

No TURN credentials/server were added. Existing STUN-only calls can fail across
restrictive NAT/firewalls; that requires an owner-provided TURN service, not a UI
fix. Camera acquisition is serialized, and the initiating side waits for the
receiver's media acknowledgement before renegotiating. If camera permission is
denied, voice should remain usable and the affected phone shows a notice.
