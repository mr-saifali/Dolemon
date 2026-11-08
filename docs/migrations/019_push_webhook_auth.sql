-- ============================================================================
-- Dolemon · migration 019 — push delivery without a service-role key
-- Apply after 012. Idempotent, except that it keeps the existing secret.
--
-- The database owns the webhook secret:
--   * `messages` INSERT fires `notify_push_webhook()`, which POSTs the new id
--     to the app through pg_net, carrying the secret in a header
--   * the route forwards that header back into `push_delivery_targets()`, which
--     validates it and returns only the recipients' subscriptions
--
-- So Vercel needs no `SUPABASE_SERVICE_ROLE_KEY` and no shared secret. Rotating
-- the secret is one UPDATE (then update nothing else).
-- ============================================================================

create extension if not exists pg_net;

create table if not exists public.push_webhook_config (
  id boolean primary key default true check (id),
  secret text not null check (length(secret) >= 32),
  created_at timestamptz not null default now()
);
alter table public.push_webhook_config enable row level security;
revoke all on public.push_webhook_config from public, anon, authenticated;

insert into public.push_webhook_config (id, secret)
select true, encode(gen_random_bytes(32), 'hex')
where not exists (select 1 from public.push_webhook_config);

create or replace function public.push_delivery_targets(p_secret text, p_message_id uuid)
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  conversation_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_message record;
begin
  select c.secret into v_secret from public.push_webhook_config c where c.id;
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;

  select m.id, m.conversation_id, m.sender_id into v_message
    from public.messages m
   where m.id = p_message_id;
  if v_message.id is null then
    return;
  end if;

  -- claim the event once so webhook retries cannot double-notify
  begin
    insert into public.push_notification_events (message_id) values (p_message_id);
  exception when unique_violation then
    return;
  end;

  return query
    select s.id, s.endpoint, s.p256dh, s.auth_key, v_message.conversation_id
      from public.push_subscriptions s
      join public.conversation_members cm on cm.user_id = s.user_id
     where cm.conversation_id = v_message.conversation_id
       and cm.user_id <> v_message.sender_id;
end;
$$;

revoke execute on function public.push_delivery_targets(text, uuid) from public, authenticated;
grant execute on function public.push_delivery_targets(text, uuid) to anon;

create or replace function public.push_forget_subscription(p_secret text, p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select c.secret into v_secret from public.push_webhook_config c where c.id;
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  delete from public.push_subscriptions where id = p_subscription_id;
end;
$$;

revoke execute on function public.push_forget_subscription(text, uuid) from public, authenticated;
grant execute on function public.push_forget_subscription(text, uuid) to anon;

create or replace function public.notify_push_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
begin
  select c.secret into v_secret from public.push_webhook_config c where c.id;
  if v_secret is null then
    return new;
  end if;
  perform net.http_post(
    url := 'https://dolemon.vercel.app/api/push/message',
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'public',
      'table', 'messages',
      'record', jsonb_build_object('id', new.id)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dolemon-webhook-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

drop trigger if exists messages_push_webhook on public.messages;
create trigger messages_push_webhook
  after insert on public.messages
  for each row execute function public.notify_push_webhook();
