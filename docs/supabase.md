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

In **Authentication → Providers → Email**, enable **Email OTP**. Set the OTP length
(**Authentication → Providers → Email → Email OTP length**) to the same value as
`NEXT_PUBLIC_OTP_LENGTH` — the provisioned `dolemon` project uses **8**. The verify screen
renders exactly that many boxes and auto-submits at that length, so a mismatch silently
blocks sign-in.

Password signup is the primary path and needs *Confirm email* **off**
(`mailer_autoconfirm = true` on this project), so `signUp()` returns a session immediately and
no inbox is involved. If you turn *Confirm email* on for OTP sign-in, edit the confirmation
template to include `{{ .Token }}` — the default template only renders
`{{ .ConfirmationURL }}`, so the code never reaches the user.

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
  reaction_type text, -- checked against lib/reactions.ts; expanded by migration 021
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

Chat media lives in a **private** bucket. Members upload into their
conversation's folder; readers exchange the opaque reference stored in
`messages.media_url` (`dolemon-media:<conversation>/<file>`) for a short-lived
signed URL. A copied row, a database dump or a pasted link no longer exposes the
file — and once a chat is deleted, its membership rows are gone, so nobody can
mint a URL for it any more.

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

-- private bucket. Object path shape: <conversation_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

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

-- only members may read, which is what lets the client mint a signed URL
-- (migration 016)
drop policy if exists "chat media read by members" on storage.objects;
create policy "chat media read by members" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_conversation_member(public.chat_media_conv(name)));

-- anyone may delete files they uploaded
drop policy if exists "chat media delete own" on storage.objects;
create policy "chat media delete own" on storage.objects for delete
  using (bucket_id = 'chat-media' and owner = auth.uid());
```

> If your `is_conversation_member` helper takes a named parameter (e.g.
> `target uuid`) or lives under a different name, adjust the one line in the
> insert policy to match — it's the only place the helper is referenced.

Two migration files finish the job, in this order: `016_chat_media_read_policy.sql`
(the read policy above) and `017_chat_media_private.sql` (rewrite historical
public URLs to references, then flip `storage.buckets.public`). **Deploy the
build that signs media URLs before running 017** — old clients render the stored
value directly and would lose every attachment the moment the bucket flips.

The client flow (`lib/use-remote-thread.ts` → `uploadChatMedia` in `lib/db.ts`):
show the bubble instantly with the local data URL, upload to
`chat-media/<conversation_id>/<uuid>.<ext>`, store the reference, and resolve it
through `lib/media-url.ts` (`createSignedUrl`, cached for an hour,
`lib/use-media-url.ts` in the bubble). The partner's client picks up the row over
Realtime and signs it the same way.

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

## 8. Migrations — current status

These files are **not** an automatic pipeline: they are applied by hand in the SQL editor.
The `dolemon` project (`lakgolufbudlyaepkehh`, ap-south-1) has **004–015 applied**. Only the
original core schema and 010–015 appear in `supabase_migrations.schema_migrations` — 004–009
were pasted into the SQL editor. The table below is the source of truth for what is live, not
the history table.

| File | Status | Unlocks |
| --- | --- | --- |
| `docs/migrations/004_privacy_deletion.sql` | applied | Private/public accounts, delete-chat, private accounts hidden from search |
| `docs/migrations/005_read_receipts.sql` | applied | Telegram-style read ticks + exact read time |
| `docs/migrations/006_revoke_self_deletion.sql` | applied | Drops `delete_my_account()` — accounts can't self-delete |
| `docs/migrations/008_doremon_memory.sql` | applied | Doremon's compressed per-conversation memory |
| `docs/migrations/009_reply_to.sql` | applied | Replies (`reply_to_id`) |
| `docs/migrations/010_doremon_room.sql` | applied | Per-user, deletion-proof records + `doremon_stats()` + `doremon_records()` |
| `docs/migrations/011_privacy_and_memory.sql` | applied | Fixes the visibility RPC + private memory policies |
| `docs/migrations/012_push_notifications.sql` | applied | `push_subscriptions`, `push_notification_events` (Web Push) |
| `docs/migrations/013_temporary_video.sql` | applied | `temporary_chat_videos` + private `temporary-chat-videos` bucket |
| `docs/migrations/014_app_presence.sql` | applied | Private `app-presence:<conversation>` Realtime topics |
| `docs/migrations/015_rpc_and_message_hardening.sql` | applied | Message UPDATE membership check, anon EXECUTE revoked, TRUNCATE/REFERENCES/TRIGGER revoked |
| `docs/migrations/016_chat_media_read_policy.sql` | applied | Members can read/sign objects in the private `chat-media` bucket |
| `docs/migrations/017_chat_media_private.sql` | applied (after the signed-URL build went live) | Rewrites stored public URLs to `dolemon-media:` references, flips the bucket private and caps uploads at 25 MB |
| `docs/migrations/018_presence_moments_integrity.sql` | applied | Presence moments can only name someone you share a chat with |
| `docs/migrations/019_push_webhook_auth.sql` | applied | `pg_net` INSERT webhook + database-owned secret; no service-role key in Vercel |
| `docs/migrations/020_storage_cleanup.sql` | applied | Cron cleanup for expired temporary videos and orphaned chat media, anon key only |

Notes:
- **Private accounts were broken even though 004 looked applied.** In the original 004 the
  `visibility` argument shadows `profiles.visibility`, so `set visibility = visibility` was a
  no-op: the RPC returned success and the column never changed, which made the Settings
  toggle fail its "did it stick?" check. 011 replaces it with a positional `$1` version; 004 in
  this repo now carries the same fixed definition so re-running it cannot regress.
- **004 contains `delete_my_account()`.** 006 drops that one function again — the app has no
  self-deletion path.
- 010 converts `doremon_memory` to one row **per member** (legacy shared rows are copied to
  both members) and makes the record survive chat deletion. **Do not re-run 010 after 011**:
  it reinstates the older foreign key and policy.
- `mark_conversation_read` is untouched; 005 adds `touch_read_cursor` /
  `conversation_read_state` beside it.
- An account is only ever removed by an admin: Supabase → Authentication → Users → Delete user.

### Verifying the live configuration

```sql
-- private accounts: run the toggle, then read it back
select public.set_account_visibility('private');
select visibility from public.profiles where id = auth.uid();

-- private accounts must not be searchable
select * from public.search_users('<your handle>');

-- the private presence channel only authorises members
select * from pg_policies where schemaname = 'realtime';
```

### Known gaps that are configuration, not migrations

- **Chat media retention.** The bucket is private and only members can sign an object, so a
  deleted chat's files become unreachable immediately. `/api/media/cleanup` (daily cron, anon
  key, migration 020) then removes orphaned objects; message-level deletes inside a live chat
  keep the file until the chat itself goes.
- **Web Push** is configured: the VAPID pair and subject live in Vercel (production and
  preview), everything else is database-side after 019 (`pg_net`, the `messages` INSERT
  trigger, the secret in `push_webhook_config`). No `SUPABASE_SERVICE_ROLE_KEY` or
  `PUSH_WEBHOOK_SECRET` belongs in Vercel. `/api/push/status` reports `configured: true` once
  the variables are present in a build, and each device still has to opt in from Settings.
  Android's WebView has no Push API, so the APK hands notification setup to Chrome.
- **Free-tier email is capped at 2/hour** (`rate_limit_email_sent`). Password signup with
  autoconfirm never sends mail, so account creation is unaffected; an OTP flow would hit it.
- `mailer_otp_exp` is 3600s (1 hour) while README copy once mentioned 10 minutes.

## 9. Doremon — the private observer

Doremon is accessed from the chat header or its room. Automatic local analysis
is opt-in; it can save account memory and may be inaccurate. Saved memories can
survive conversation deletion and should not be treated as a complete record.
Do not infer emotions, intentions or future behavior from message counts.

**Setup and current behavior**

- `GEMINI_API_KEY` is server-side only. The fixed model and project quota need
  live verification; there is no paid-model fallback.
- Existing `docs/migrations/008_doremon_memory.sql`, `010_doremon_room.sql`
  and `011_privacy_and_memory.sql` were historically applied manually. Check
  the actual database history before applying anything; these files are not an
  automatic migration pipeline and must not be blindly replayed.
- An authenticated `POST /api/doremon` accepts only `ask`, `roomAsk` or
  `daily`. With explicit per-request acknowledgement, `conversation-v1` shares
  selected text, the actual question, a short note and up to three Q&A turns.
  Browser and server apply the same bounds (maximum 16 excerpts and 9,000-byte
  context JSON). Names, IDs and media objects are not packet fields; personal
  information embedded in message text can still be shared. Legacy packets
  without the marker remain generic. See [privacy and token controls](doremon-context.md).
- Local search covers only loaded messages. Contextual AI can now reason over
  selected excerpts, not the complete archive. No external AI call runs on
  room opening or on every message; automatic memory bookkeeping stays local.
- New room Q&A is kept in unencrypted browser storage (five exchanges per
  account and conversation), not uploaded as new account history. Existing
  server-saved history and other memories may remain until explicitly deleted.
  This is not a substitute for device security or a formal privacy audit.

### Expanded emoji reactions (021)

`docs/migrations/021_expanded_reactions.sql` expands the existing reaction check to
37 stable IDs (the original five remain unchanged). Apply before deploying the
expanded picker. It changes only `message_reactions_reaction_type_check`; no rows,
RLS policies, storage objects, API keys or Realtime configuration are changed.

Applied on 2026-11-08 to `lakgolufbudlyaepkehh` as
`expanded_reactions_021`; a readback confirmed all 37 IDs and
`convalidated = true`. Do not rerun old privacy/storage migrations for this change.
