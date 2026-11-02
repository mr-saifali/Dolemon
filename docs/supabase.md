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
