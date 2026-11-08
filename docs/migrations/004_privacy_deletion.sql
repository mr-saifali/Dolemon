-- ============================================================================
-- Dolemon · migration 004 — privacy & deletion
-- Run this once in the Supabase SQL editor (or `supabase db push` if linked).
-- Everything here is idempotent: re-running it is safe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Private / public accounts
-- ----------------------------------------------------------------------------
-- `private` = hidden from search. Only an exact handle in "Invite a friend"
-- finds you (open_direct_conversation is untouched on purpose).
alter table public.profiles
  add column if not exists visibility text not null default 'public';

alter table public.profiles
  drop constraint if exists profiles_visibility_check;

alter table public.profiles
  add constraint profiles_visibility_check
  check (visibility in ('public', 'private'));

-- The toggle in Settings calls this.
-- IMPORTANT: the parameter name shadows the `profiles.visibility` column, so an
-- unqualified `visibility` in the body resolves to the COLUMN, not the
-- argument — the UPDATE becomes a silent no-op. Always refer to the argument
-- positionally ($1). This is the same definition migration 011 installs, kept
-- here so re-running 004 can never regress private accounts.
create or replace function public.set_account_visibility(visibility text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if $1 is null or $1 not in ('public', 'private') then raise exception 'INVALID_VISIBILITY'; end if;
  update public.profiles p set visibility = $1 where p.id = auth.uid();
end;
$$;

revoke execute on function public.set_account_visibility(text) from public, anon;
grant execute on function public.set_account_visibility(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Search hides private accounts
-- ----------------------------------------------------------------------------
-- Replaces the existing search_users(). Same return shape the app already
-- reads: id, username, avatar_id, avatar_url (photo lives on profiles itself).
create or replace function public.search_users(q text)
returns table (
  id uuid,
  username text,
  avatar_id text,
  avatar_url text
)
language sql
security definer
set search_path = public
stable
as $$
  select p.id,
         p.username,
         p.avatar_id,
         p.avatar_url
    from public.profiles p
   where p.username is not null
     and p.visibility = 'public'          -- <-- the privacy gate
     and (
           lower(p.username) like lower(q || '%')
        or lower(p.username) like '%' || split_part(lower(q), '.', 1) || '%'
         )
   order by length(p.username) asc, p.username asc
   limit 20;
$$;

-- ----------------------------------------------------------------------------
-- 3. Delete a conversation (for both members)
-- ----------------------------------------------------------------------------
create or replace function public.delete_conversation(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_member boolean;
begin
  select count(*) > 0
    into v_is_member
    from public.conversation_members cm
   where cm.conversation_id = target
     and cm.user_id = auth.uid();

  if not v_is_member then
    raise exception 'NOT_A_MEMBER';
  end if;

  delete from public.message_reactions
   where message_id in (select id from public.messages where conversation_id = target);

  delete from public.messages
   where conversation_id = target;

  delete from public.conversation_members
   where conversation_id = target;

  delete from public.conversations
   where id = target;
end;
$$;

revoke execute on function public.delete_conversation(uuid) from anon;

-- ----------------------------------------------------------------------------
-- 4. Delete my account
-- ----------------------------------------------------------------------------
-- Wipes everything the app can see for this user. The auth.users row itself
-- can't be removed from a normal RPC (needs the service role) — if you want
-- full removal, delete the user from Supabase → Auth → Users after this.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_empty uuid;
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  -- reactions I added, to anyone
  delete from public.message_reactions
   where user_id = v_me;

  -- messages I sent
  delete from public.messages
   where sender_id = v_me;

  -- leave every room
  delete from public.conversation_members
   where user_id = v_me;

  -- rooms that are now empty disappear entirely
  select c.id into v_empty
    from public.conversations c
   where not exists (
     select 1 from public.conversation_members cm where cm.conversation_id = c.id
   )
   limit 1;

  while v_empty is not null loop
    delete from public.conversations where id = v_empty;
    select c.id into v_empty
      from public.conversations c
     where not exists (
       select 1 from public.conversation_members cm where cm.conversation_id = c.id
     )
     limit 1;
  end loop;

  -- presence, if the columns exist on your schema
  if to_regclass('public.presence_settings') is not null then
    execute 'delete from public.presence_settings where user_id = ' || quote_literal(v_me::text);
  end if;

  if to_regclass('public.presence_moments') is not null then
    execute 'delete from public.presence_moments where user_id = ' || quote_literal(v_me::text);
  end if;

  -- finally, the profile itself
  delete from public.profiles where id = v_me;
end;
$$;

revoke execute on function public.delete_my_account() from anon;

-- ----------------------------------------------------------------------------
-- 5. Profile row: let the app read its own visibility
-- ----------------------------------------------------------------------------
-- (If your profiles policy already grants select on your own row, nothing to
-- do. This is a no-op safety net for the loadProfile query.)
do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'profiles' and permissive = 'OR' and cmd = 'SELECT'
       and qual like '%auth.uid() = id%'
  ) then
    alter table public.profiles enable row level security;
    drop policy if exists "profiles_select_own" on public.profiles;
    create policy "profiles_select_own" on public.profiles
      for select using (auth.uid() = id);
  end if;
end;
$$;
