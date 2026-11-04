-- ============================================================================
-- Dolemon · migration 009 — Telegram-style replies
-- Run this once in the Supabase SQL editor (or `supabase db push` if linked).
-- Idempotent: safe to re-run.
--
-- How it works:
--   * `reply_to_id` points the replying message at the original
--   * deleting the original removes the quote gracefully (ON DELETE SET NULL)
--   * the app resolves the quoted text client-side (thread load + realtime)
-- ============================================================================

-- the reply link (a message may quote any other message in the same room)
alter table public.messages
  add column if not exists reply_to_id uuid;

-- self-referencing foreign key, added NOT VALID so the add is instant even
-- on a busy table; validated in the next statement (share lock only)
alter table public.messages
  drop constraint if exists messages_reply_to_id_fkey;

alter table public.messages
  add constraint messages_reply_to_id_fkey
  foreign key (reply_to_id) references public.messages (id)
  on delete set null
  not valid;

alter table public.messages
  validate constraint messages_reply_to_id_fkey;

-- quote lookups happen on every thread load and on every realtime reply
create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id);
