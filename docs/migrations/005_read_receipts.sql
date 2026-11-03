-- ============================================================================
-- Dolemon · migration 005 — Telegram-style read receipts
-- Run this once in the Supabase SQL editor (or `supabase db push` if linked).
-- Idempotent: safe to re-run.
--
-- How it works:
--   * each conversation member gets a `last_read_at` cursor
--   * opening a thread calls touch_read_cursor() and the client broadcasts
--     the moment on the thread channel, so the other side's ticks turn
--     without a refresh
--   * conversation_read_state() gives a fresh app the partner's cursor
-- ============================================================================

-- the partner's read cursor (one column per seat at the table)
alter table public.conversation_members
  add column if not exists last_read_at timestamptz;

-- push my read cursor. Runs alongside the existing mark_conversation_read,
-- which is left untouched so the unread counter keeps working exactly as before.
create or replace function public.touch_read_cursor(target uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members
     set last_read_at = now()
   where conversation_id = target
     and user_id = auth.uid();
$$;

revoke execute on function public.touch_read_cursor(uuid) from anon;

-- where is the OTHER person's cursor? (the app only ever reads its own seat,
-- so this needs the definer jump)
create or replace function public.conversation_read_state(target uuid)
returns table (partner_read_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select cm.last_read_at
    from public.conversation_members mine
    join public.conversation_members cm
      on cm.conversation_id = mine.conversation_id
     and cm.user_id <> mine.user_id
   where mine.conversation_id = target
     and mine.user_id = auth.uid();
$$;

revoke execute on function public.conversation_read_state(uuid) from anon;
