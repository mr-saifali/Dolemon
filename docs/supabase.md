# Wiring Dolemon to Supabase

Out of the box the app runs on a **local demo provider** (everything in `localStorage`)
so the onboarding flow is fully clickable with no backend. Add the two env vars below and
the same screens switch to real Supabase Auth (`lib/auth/supabase.ts`).

```bash
cp .env.example .env.local
# NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## 1. Auth settings

In **Authentication → Providers → Email**, enable **Email OTP**. Turn *Confirm email* on so
`signInWithOtp` sends a 6-digit code. Set the OTP length to 6
(**Authentication → Providers → Email → Email OTP length**).

## 2. Schema

Run in the SQL editor:

```sql
-- one profile per auth user
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  avatar_id text,
  app_lock_hash text,
  app_lock_salt text,
  created_at timestamptz not null default now(),
  constraint username_shape check (
    username is null or username ~ '^[a-z0-9._]{3,20}$'
  )
);

alter table public.profiles enable row level security;

create policy "own profile read"   on public.profiles for select using (auth.uid() = id);
create policy "own profile write"  on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- username availability must be checkable without reading other rows
create or replace function public.username_available(candidate text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from profiles where lower(username) = lower(candidate));
$$;

-- app-lock: hash server-side so the plain password never lands in the DB
create extension if not exists pgcrypto;

create or replace function public.set_app_lock(new_password text)
returns void language plpgsql security definer set search_path = public as $$
declare s text := encode(gen_random_bytes(16), 'hex');
begin
  update profiles
     set app_lock_salt = s,
         app_lock_hash = crypt(new_password, s)
   where id = auth.uid();
end $$;

create or replace function public.verify_app_lock(attempt text)
returns boolean language plpgsql security definer set search_path = public as $$
declare h text;
begin
  select app_lock_hash into h from profiles where id = auth.uid();
  if h is null then return true; end if;
  return h = crypt(attempt, (select app_lock_salt from profiles where id = auth.uid()));
end $$;
```

The client currently calls `profiles.ilike("username", …)` for the live availability check;
swap that for `rpc("username_available", …)` once you tighten RLS, since users can only
SELECT their own row.

## 3. What is *not* protected

App lock is a **soft gate** — it hides the UI on a shared phone, it does not encrypt
messages and it does not stop someone with devtools. Real secrecy needs server-side
authorisation plus end-to-end encryption, which is the next milestone.

## 4. Presence (the part that makes Dolemon different)

The thread treats presence as the primary state of the room: `lib/presence.ts` exposes
`together`, `togetherSince` and `lastSeenAt`, and the UI warms up when both people are in
it. Swap the demo hooks for a Realtime channel:

```ts
const channel = supabase.channel(`room:${conversationId}`, {
  config: { presence: { key: user.id } },
});

channel
  .on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();          // who is in the room right now
    setPartner(Object.keys(state).some((id) => id !== user.id) ? "here" : "away");
  })
  .on("presence", { event: "join" }, ({ key }) => {
    if (key !== user.id) startTogetherClock();      // they walked in
  })
  .on("presence", { event: "leave" }, ({ key }) => {
    if (key !== user.id) closeTogetherClock(key);   // write a presence_moments row
  })
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
  });
```

Two tables make the "you were both here" cards real rather than decorative:

```sql
create table public.presence_moments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  -- only members of the 1:1 conversation may read these rows
  created_by uuid not null default auth.uid() references auth.users (id)
);
```

Typing stays ephemeral and untracked in the DB — it belongs on the same channel as a
broadcast event, which is why the UI already models `typing` as a presence state rather
than a message.

## 5. Pulses, lamps and presence memory

Three pieces sit on top of the presence channel:

| Piece | Where it lives | Backend shape |
| --- | --- | --- |
| **Pulse** ("thinking of you", no message) | `lib/pulses.ts` | broadcast event `pulse` on the conversation channel; throttled server-side to one per 15s per sender, nothing persisted |
| **Lamp** ("leave a light on") | `prefs.lampOn` | a `presence_settings` row per user (`lamp_on boolean`, `show_presence boolean`, `allow_pulses boolean`) |
| **Presence memory** ("you were both here 22m") | `lib/presence-log.ts` | `presence_moments` rows written on channel `leave`; the room reads the last 7 days for the weekly chart |

Mutual pulses (two crossing within 60s) create a presence moment rather than a message —
that's the only lasting trace a pulse leaves, which is the point: it's a gesture, not a log.

```sql
create table public.presence_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  show_presence boolean not null default true,
  allow_pulses  boolean not null default true,
  lamp_on       boolean not null default false
);
alter table public.presence_settings enable row level security;
create policy "own presence settings" on public.presence_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

The client already reads these through one hook (`usePrefs`), so swapping localStorage for
a row is a single-file change.

## 6. Voice & video calls

The call UI is finished; the media layer is the only part that needs a backend. `lib/calls.ts`
already models the phases a real session goes through, so wiring WebRTC means replacing two
functions:

1. **`dial()`** → create an `RTCPeerConnection`, add local tracks, send an **offer** over a
   Supabase Realtime broadcast channel, and apply the **answer** when it arrives.
2. **`end()`** → close the peer connection, stop every local track, and write the call event
   (already done via `appendCallEvent`).

```ts
const channel = supabase.channel(`call:${conversationId}`, { config: { broadcast: { self: false } } });

channel
  .on("broadcast", { event: "offer" },  async ({ payload }) => {
    await pc.setRemoteDescription(payload.sdp);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    channel.send({ type: "broadcast", event: "answer", payload: { sdp: answer } });
  })
  .on("broadcast", { event: "answer" }, ({ payload }) => pc.setRemoteDescription(payload.sdp))
  .on("broadcast", { event: "ice" },    ({ payload }) => pc.addIceCandidate(payload.candidate))
  .subscribe();

pc.onicecandidate = ({ candidate }) =>
  candidate && channel.send({ type: "broadcast", event: "ice", payload: { candidate } });
```

Wiring checklist:

- [ ] **TURN server.** STUN alone fails on Indian mobile carriers behind symmetric NAT.
      Budget for a TURN service (Twilio, Metered, or self-hosted coturn) or calls will connect
      on Wi-Fi and silently fail on 4G.
- [ ] **Incoming calls while the app is closed** need Web Push + a service worker, then
      `ringing` state on open. Realtime channels only reach open tabs.
- [ ] **Permissions**: microphone for voice, camera + microphone for video, with the explicit
      "they can see me" confirmation the current UI already implies.
- [ ] **Call rows** in `presence_moments`-style storage: `calls(id, conversation_id, type,
      started_at, ended_at, ended_by)` so missed calls survive a refresh.
- [ ] **Ring timeout**: 30s, then write a missed-call event — matches the current demo timing.

Until that's connected the call screen runs a simulated session (labelled "Simulated call ·
media not connected") so the whole flow — ring, accept, mute, camera flip, timer, end, timeline
entry, missed call — can be reviewed and edited.

## 7. Messages + reactions (already deployed)

The `message_reactions` feature is live on the project (`dolemon_messages_and_reactions`
migration):

```sql
conversations(id, created_at)
conversation_members(conversation_id, user_id)          -- membership is the ACL
messages(id, conversation_id, sender_id, kind, body, created_at)
message_reactions(
  id, message_id → messages(id) on delete cascade,
  user_id → auth.users(id) on delete cascade,
  reaction_type check in ('dil','haha','wow','aww','hype'),
  created_at,
  unique (message_id, user_id)                          -- one reaction per person
)
```

RLS:

| Table | Select | Insert | Update / Delete |
| --- | --- | --- | --- |
| `conversations` | members only | — | — |
| `conversation_members` | members only | — | — |
| `messages` | members only | `sender_id = auth.uid()` + member | own rows |
| `message_reactions` | messages you can see | `user_id = auth.uid()` + visible message | own rows only |

`is_conversation_member()` and `can_see_message()` are `security definer` helpers so the
policies don't recurse into each other. Both `messages` and `message_reactions` are in the
`supabase_realtime` publication.

The client already speaks this shape (`lib/reactions.ts`): `dil | haha | wow | aww | hype`,
one reaction per person per message, and a pick replaces the old one. Until auth + message
persistence are switched on, the thread and its reactions live in `localStorage` and sync
between tabs over a `BroadcastChannel` named `dolemon:thread:<id>` — the same seam a
Realtime channel plugs into.

## 7a. Chat media — photos, voice notes, files

Run this in the SQL editor. It adds the media columns to `messages` and a
public `chat-media` storage bucket whose folder-per-conversation RLS policy
only lets members of that 1:1 upload.

```sql
-- media columns (all nullable — text/sticker rows stay untouched)
alter table public.messages
  add column if not exists media_url text,
  add column if not exists media_name text,
  add column if not exists media_size bigint,
  add column if not exists media_duration integer;

-- if your messages.kind has a check constraint, widen it to include the
-- media kinds (harmless if it doesn't exist):
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages
  add constraint messages_kind_check
  check (kind in ('text','sticker','call','presence','image','audio','file'));

-- public bucket. Object path shape: <conversation_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do update set public = true;

-- the conversation folder a storage path belongs to (null when malformed)
create or replace function public.chat_media_conv(name text)
returns uuid
language sql immutable
as $$
  select case
    when split_part(name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
    then split_part(name, '/', 1)::uuid
    else null
  end;
$$;

-- only members of that 1:1 may upload into its folder
drop policy if exists "chat media upload by members" on storage.objects;
create policy "chat media upload by members" on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and auth.role() = 'authenticated'
    and public.is_conversation_member(public.chat_media_conv(name))
  );

-- anyone may delete files they uploaded
drop policy if exists "chat media delete own" on storage.objects;
create policy "chat media delete own" on storage.objects for delete
  using (bucket_id = 'chat-media' and owner = auth.uid());
```

> If your `is_conversation_member` helper takes a named parameter (e.g.
> `target uuid`) or lives under a different name, adjust the one line in the
> insert policy to match — it's the only place the helper is referenced.

The client flow (`lib/use-remote-thread.ts` → `uploadChatMedia` in `lib/db.ts`):
show the bubble instantly with the local data URL, upload to
`chat-media/<conversation_id>/<uuid>.<ext>`, then insert the row with the
public URL — the partner's client picks it up over Realtime and renders the
same photo / player / file card.

### Replacing the local store with Realtime

```ts
const sb = getSupabase();

// one channel per conversation
const channel = sb
  .channel(`reactions:${conversationId}`)
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` },
    (payload) => mergeReaction(payload.new, payload.eventType)
  )
  .subscribe();

// writing my reaction: delete-then-insert keeps the unique(message_id, user_id) rule
await sb.from("message_reactions").upsert(
  { message_id, user_id: me, reaction_type: type },
  { onConflict: "message_id,user_id" }
);
```

Note the `filter` above needs `conversation_id` on the reactions table for server-side
filtering; today it's one hop away on `messages`, so subscribe without a filter and drop
rows that don't belong to the open thread.

## 8. Pending migrations (manual run — in order)

The app is written to degrade gracefully without these (nothing breaks login),
but each unlocks a feature. Run them in the Supabase SQL editor, in order:

| File | Unlocks |
| --- | --- |
| `docs/migrations/004_privacy_deletion.sql` | Private/public accounts, delete-chat, (deletion — see 006) |
| `docs/migrations/005_read_receipts.sql` | Telegram-style read ticks + exact read time (live) |
| `docs/migrations/006_revoke_self_deletion.sql` | Drops `delete_my_account()` — accounts can't self-delete |
| `docs/migrations/009_reply_to.sql` | Replies — a message can quote another (the `reply_to_id` column) |

Notes:
- **004 contains `delete_my_account()`.** If you already ran 004, just run 006 —
  it drops that one function. The app itself has no self-deletion path.
- `mark_conversation_read` (your existing unread logic) is **not** touched; 005
  adds a separate `touch_read_cursor` / `conversation_read_state` pair next to it.
- An account is only ever removed by an admin: Supabase → Authentication → Users
  → Delete user.

## 9. Doremon — the resident AI

Doremon watches every chat quietly and keeps a compressed record per
conversation (moods, fight patterns, deep-talk moments). He **never speaks on
his own** — no greetings, no interventions — and only answers when summoned
with `/doremon <anything>` in chat (or a tap on his face in the header).

**Setup**

1. Env (Vercel → project → Environment Variables, or `.env.local` locally):
   - `GEMINI_API_KEY` — from https://aistudio.google.com/apikey (server-side only)
   - `GEMINI_MODEL` — optional, default `gemini-2.5-flash` (bump to the newest flash)
2. Run `docs/migrations/008_doremon_memory.sql` in the SQL editor — the
   `doremon_memory` table (jsonb record, member RLS, on-delete cascade).

**Behaviour**

- No key / table not run: Doremon still works — his local brain (heuristics +
  persona templates) keeps him alive; the compressed record just lives in the
  browser until the table exists.
- The Gemini key never reaches the browser — all calls go through
  `POST /api/doremon`.
- His chat lines are ephemeral (like system moments); the *record* is what
  persists, shared by both members.
