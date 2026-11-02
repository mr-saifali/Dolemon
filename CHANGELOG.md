# Changelog

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
