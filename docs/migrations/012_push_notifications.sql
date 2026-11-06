-- Opt-in Web Push subscriptions. Apply after the earlier schema migrations.
-- The service role alone reads recipients for delivery; users can manage only
-- their own subscriptions. No message text is stored in this table.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 16 and 2048),
  p256dh text not null check (length(p256dh) between 16 and 256),
  auth_key text not null check (length(auth_key) between 8 and 256),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "manage own push subscriptions" on public.push_subscriptions;
create policy "manage own push subscriptions" on public.push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Atomic deduplication of database webhook retries; never client-accessible.
create table if not exists public.push_notification_events (
  message_id uuid primary key references public.messages(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.push_notification_events enable row level security;
revoke all on public.push_notification_events from anon, authenticated;
-- The webhook handler uses only the server-side service role.
grant all on public.push_subscriptions to service_role;
grant all on public.push_notification_events to service_role;
