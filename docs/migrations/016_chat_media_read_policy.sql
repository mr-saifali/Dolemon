-- ============================================================================
-- Dolemon · migration 016 — private chat media, read side
-- Idempotent. Apply before the build that signs media URLs goes live.
--
-- The `chat-media` bucket used to be public: anyone holding an attachment URL
-- could open it forever, and deleting a chat never removed the file. Making it
-- private has two halves:
--
--   016 (this file)  authorise members to read an object, so the client can
--                    mint a short-lived signed URL. Harmless for old clients.
--   017              rewrite stored public URLs to opaque references and flip
--                    `storage.buckets.public` to false.
--
-- Keep 017 until the signed-URL build is deployed, otherwise old clients lose
-- every attachment the moment the bucket flips.
-- ============================================================================

-- The conversation a stored object belongs to (null when malformed).
-- `chat_media_conv()` already exists from docs/supabase.md §7a; keep it in one
-- place and only wrap it here.
create or replace function public.is_chat_media_member(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_conversation_member(public.chat_media_conv(object_name));
$$;

revoke execute on function public.is_chat_media_member(text) from public, anon;
grant execute on function public.is_chat_media_member(text) to authenticated;

-- Members of the conversation may read (and therefore sign) its objects.
drop policy if exists "chat media read by members" on storage.objects;
create policy "chat media read by members" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and public.is_chat_media_member(name));
