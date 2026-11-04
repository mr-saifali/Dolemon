-- ============================================================================
-- Dolemon · migration 010 — Doremon's room (private observer)
-- Run this once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- What changes:
--   * doremon_memory becomes PER-USER (each member has their own private
--     Doremon record — the other person never sees it)
--   * the record SURVIVES chat deletion (the conversation link no longer
--     cascades) — even a deleted chat keeps its summary in Doremon's pocket
--   * doremon_stats() — the whole timing/talking census of a conversation:
--     who talks more, how much per day, at which hours, who starts, silences
--   * doremon_records() — the list of conversations Doremon has a record for
--     (including deleted ones) for the current user only
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Per-user, deletion-proof memory
-- --------------------------------------------------------------------------

-- free the primary key so one conversation can hold one row PER member
alter table public.doremon_memory
  drop constraint if exists doremon_memory_pkey;

alter table public.doremon_memory
  add column if not exists user_id uuid;

-- backfill: give every legacy (shared) record to BOTH members of the chat
insert into public.doremon_memory (conversation_id, user_id, memory, updated_at)
select dm.conversation_id, cm.user_id, dm.memory, dm.updated_at
  from public.doremon_memory dm
  join public.conversation_members cm
    on cm.conversation_id = dm.conversation_id
 where dm.user_id is null;

-- legacy rows (no owner) have been copied — remove them
delete from public.doremon_memory where user_id is null;

alter table public.doremon_memory
  alter column user_id set not null;

alter table public.doremon_memory
  add primary key (conversation_id, user_id);

-- the conversation link keeps the record after the chat is deleted
alter table public.doremon_memory
  drop constraint if exists doremon_memory_conversation_id_fkey;

alter table public.doremon_memory
  add constraint doremon_memory_conversation_id_fkey
  foreign key (conversation_id) references public.conversations (id)
  on delete no action;

-- the owner link
alter table public.doremon_memory
  drop constraint if exists doremon_memory_user_id_fkey;

alter table public.doremon_memory
  add constraint doremon_memory_user_id_fkey
  foreign key (user_id) references auth.users (id)
  on delete cascade;

-- PRIVATE: each member sees only their own Doremon's record
drop policy if exists "doremon own conversation" on public.doremon_memory;

create policy "doremon record is private" on public.doremon_memory
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 2. doremon_stats — the talking census of one conversation
-- --------------------------------------------------------------------------
--
-- One call returns everything Doremon needs to answer "who talks more, when,
-- how often, who starts, when did they go quiet". It only runs for members
-- of the conversation (the app connects with the user's own token).

create or replace function public.doremon_stats(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.conversation_members cm
     where cm.conversation_id = target
       and cm.user_id = auth.uid()
  ) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'total', coalesce(count(*), 0),
    'firstAt', min(created_at),
    'lastAt', max(created_at)
  ) into result
  from public.messages
  where conversation_id = target;

  if coalesce((result ->> 'total')::int, 0) = 0 then
    return result;
  end if;

  result := result || jsonb_build_object(
    -- per person: volume, last message, last-14-days per-day counts, hour histogram
    'users', (
      select coalesce(jsonb_object_agg(u.uid, jsonb_build_object(
        'total', u.total,
        'lastAt', u.last_at,
        'perDay', (
          select coalesce(jsonb_object_agg(d.dt, d.c), '{}'::jsonb)
          from (
            select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as dt,
                   count(*) as c
              from public.messages
             where conversation_id = target
               and sender_id = u.uid
             group by 1
             order by 1 desc
             limit 14
          ) d
        ),
        'hours', (
          select coalesce(jsonb_object_agg(h.h, h.c), '{}'::jsonb)
          from (
            select extract(hour from created_at)::int as h,
                   count(*) as c
              from public.messages
             where conversation_id = target
               and sender_id = u.uid
             group by 1
          ) h
        )
      )), '{}'::jsonb)
      from (
        select sender_id as uid,
               count(*) as total,
               max(created_at) as last_at
          from public.messages
         where conversation_id = target
         group by sender_id
      ) u
    ),
    -- of the last 14 days, who opened the day's conversation
    'whoStarts', (
      select coalesce(jsonb_object_agg(f.uid, f.c), '{}'::jsonb)
      from (
        select f2.sender_id as uid, count(*) as c
        from (
          select sender_id,
                 row_number() over (
                   partition by date_trunc('day', created_at)
                   order by created_at, id
                 ) as rn
          from public.messages
         where conversation_id = target
           and created_at >= now() - interval '14 days'
        ) f2
       where f2.rn = 1
        group by f2.sender_id
      ) f
    )
  );

  return result;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. doremon_records — every conversation this user's Doremon remembers
-- --------------------------------------------------------------------------
--
-- `alive` = the conversation still exists. When it's gone the room still
-- works from the stored record (partner name, summary, notes live inside the
-- jsonb, so a deleted chat is still nameable).

create or replace function public.doremon_records()
returns table (
  conversation_id uuid,
  memory jsonb,
  updated_at timestamptz,
  alive boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select dm.conversation_id,
         dm.memory,
         dm.updated_at,
         exists (
           select 1 from public.conversations c
            where c.id = dm.conversation_id
         ) as alive
    from public.doremon_memory dm
   where dm.user_id = auth.uid()
   order by dm.updated_at desc
   limit 50;
$$;
