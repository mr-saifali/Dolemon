# Changelog

## 0.2 — One owner

The app stops being a messenger with settings and starts being a place that belongs to
one person.

**Know you**
- A single editable Constitution (`/app/brain`) drives greetings, language mix, quiet hours,
  Doremon's system prompt and the four-note sonic identity.
- Doremon now keeps a long-term graph — facts, inside jokes, promises / open loops and daily
  episodes — extracted locally into his existing private record.
- Draft Whisper reads a message before you send it, offline, with one-tap rewrites. It never sends.
- Your private lexicon completes words in the composer and expands "Find in chat" to synonyms.
- An append-only local event spine derives adaptations; each shows *why* and an **Undo**.

**Be honest**
- No invented presence history in live mode; the room shows real together-sessions and a
  **sources** sheet. Live mode now uses the real presence channel, names the real partner,
  and sends pulses over the Realtime broadcast channel (pulses work in both modes).
- `/app/brain → Honesty` shows every event count, confirms demo-only seeding, and downloads
  all personal data as JSON.

**Feel like yours**
- Home is a room: two lights, a lamp, a shelf of artifacts, open loops and Doremon's pocket.
  The chat list stays one tap away.
- Mood-weather gradients follow the hour, your quiet window and the conversation temperature.
- Every notification sound and the 10-second intro jingle are variations of your self chord;
  an optional ambient drone fades in only when you're both actually here.

**Ship safely**
- Labs Garden: 11 flags, one kill switch, and a changelog of what you tried and how it felt.
- 9 new pure-core tests (29 total). Typecheck, lint and production build clean.

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
