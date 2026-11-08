-- ============================================================================
-- Dolemon · migration 020 — serverless storage cleanup
-- Idempotent. Apply after 013 and 016.
--
-- Both cron jobs can only delete things that are already unreachable, so they
-- run on the anon key and need no service-role secret in Vercel:
--   * temporary videos past `expires_at`            → /api/video/cleanup
--   * chat media whose conversation row is gone     → /api/media/cleanup
--
-- Storage objects are always removed through the Storage API; deleting rows
-- from storage.objects with raw SQL would orphan the underlying files.
-- ============================================================================

-- --- expired temporary videos -------------------------------------------
create or replace function public.expired_temporary_videos()
returns table (video_id uuid, conversation_id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select v.id, v.conversation_id
    from public.temporary_chat_videos v
   where v.expires_at < now()
   order by v.expires_at
   limit 100;
$$;
revoke execute on function public.expired_temporary_videos() from public, authenticated;
grant execute on function public.expired_temporary_videos() to anon;

create or replace function public.delete_temporary_video_metadata(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.temporary_chat_videos
   where id = any(p_ids)
     and expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.delete_temporary_video_metadata(uuid[]) from public, authenticated;
grant execute on function public.delete_temporary_video_metadata(uuid[]) to anon;

drop policy if exists "expired temporary video cleanup" on storage.objects;
create policy "expired temporary video cleanup" on storage.objects for delete to anon
  using (
    bucket_id = 'temporary-chat-videos'
    and exists (
      select 1 from public.temporary_chat_videos v
       where v.conversation_id::text || '/' || v.id::text = name
         and v.expires_at < now()
    )
  );

-- --- orphaned chat media (conversation already deleted) ------------------
create or replace function public.orphan_chat_media(p_limit integer default 100)
returns table (object_name text)
language sql
security definer
set search_path = public
stable
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-media'
     and not exists (
       select 1 from public.conversations c
        where c.id = public.chat_media_conv(o.name)
     )
   order by o.created_at
   limit least(coalesce(p_limit, 100), 500);
$$;
revoke execute on function public.orphan_chat_media(integer) from public, authenticated;
grant execute on function public.orphan_chat_media(integer) to anon;

drop policy if exists "orphan chat media cleanup" on storage.objects;
create policy "orphan chat media cleanup" on storage.objects for delete to anon
  using (
    bucket_id = 'chat-media'
    and not exists (
      select 1 from public.conversations c
       where c.id = public.chat_media_conv(name)
    )
  );
