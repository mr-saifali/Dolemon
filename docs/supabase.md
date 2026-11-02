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
