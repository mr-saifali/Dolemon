-- Private, time-limited video handoff. Apply in staging after the base schema.
-- Videos are direct-to-Supabase (never proxied through the Next server).
-- Object paths are <conversation UUID>/<video UUID>, with expiry forced by DB.
create table if not exists public.temporary_chat_videos (
  id uuid primary key,
  conversation_id uuid not null,
  sender_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists temporary_chat_videos_expiry_idx on public.temporary_chat_videos(expires_at);
alter table public.temporary_chat_videos enable row level security;

create or replace function public.set_temporary_video_expiry()
returns trigger language plpgsql set search_path = public as $$
begin
  new.created_at := now();
  new.expires_at := now() + interval '7 days';
  return new;
end;
$$;
drop trigger if exists enforce_temporary_video_expiry on public.temporary_chat_videos;
create trigger enforce_temporary_video_expiry before insert on public.temporary_chat_videos
  for each row execute function public.set_temporary_video_expiry();

drop policy if exists "video metadata visible to members" on public.temporary_chat_videos;
create policy "video metadata visible to members" on public.temporary_chat_videos for select to authenticated
  using (exists (select 1 from public.conversation_members cm where cm.conversation_id = temporary_chat_videos.conversation_id and cm.user_id = auth.uid()));
drop policy if exists "video metadata created by sender" on public.temporary_chat_videos;
create policy "video metadata created by sender" on public.temporary_chat_videos for insert to authenticated
  with check (sender_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = temporary_chat_videos.conversation_id and cm.user_id = auth.uid()));
grant select, insert on public.temporary_chat_videos to authenticated;
grant all on public.temporary_chat_videos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('temporary-chat-videos', 'temporary-chat-videos', false, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "temporary video insert" on storage.objects;
create policy "temporary video insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'temporary-chat-videos' and exists (
    select 1 from public.temporary_chat_videos v
    where name = v.conversation_id::text || '/' || v.id::text and v.sender_id = auth.uid() and v.expires_at > now()
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = v.conversation_id and cm.user_id = auth.uid())
  )
);
drop policy if exists "temporary video read" on storage.objects;
create policy "temporary video read" on storage.objects for select to authenticated using (
  bucket_id = 'temporary-chat-videos' and exists (
    select 1 from public.temporary_chat_videos v
    where name = v.conversation_id::text || '/' || v.id::text and v.expires_at > now()
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = v.conversation_id and cm.user_id = auth.uid())
  )
);
-- The recipient may delete an object only after it is referenced by a message
-- from its sender. The app does this only after the local IndexedDB write commits.
drop policy if exists "recipient removes downloaded video" on storage.objects;
create policy "recipient removes downloaded video" on storage.objects for delete to authenticated using (
  bucket_id = 'temporary-chat-videos' and exists (
    select 1 from public.temporary_chat_videos v
    where name = v.conversation_id::text || '/' || v.id::text and v.sender_id <> auth.uid()
      and exists (select 1 from public.conversation_members cm where cm.conversation_id = v.conversation_id and cm.user_id = auth.uid())
      and exists (select 1 from public.messages m where m.conversation_id = v.conversation_id and m.sender_id = v.sender_id and m.media_url = 'dolemon-video:' || v.conversation_id::text || ':' || v.id::text)
  )
);
