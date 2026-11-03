-- ============================================================================
-- Dolemon · migration 008 — Doremon's memory
-- Run this once in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- Doremon (the resident AI) keeps one COMPRESSED record per conversation:
-- the pair's state, fight patterns, deep-talk moments, last moods. Both
-- members can read it (it's their own conversation) and either one's app
-- can update it as it watches the chat.
--
-- The JSON shape is owned by the app (lib/doremon/types.ts) — the DB just
-- carries it as jsonb, so Doremon's brain can evolve without migrations.
-- ============================================================================

create table if not exists public.doremon_memory (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  memory jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.doremon_memory enable row level security;

drop policy if exists "doremon own conversation" on public.doremon_memory;

create policy "doremon own conversation" on public.doremon_memory
  for all
  using (
    exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = doremon_memory.conversation_id
         and cm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.conversation_members cm
       where cm.conversation_id = doremon_memory.conversation_id
         and cm.user_id = auth.uid()
    )
  );

create or replace function public.touch_doremon_memory_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists doremon_memory_touch on public.doremon_memory;
create trigger doremon_memory_touch
  before update on public.doremon_memory
  for each row execute function public.touch_doremon_memory_updated();
