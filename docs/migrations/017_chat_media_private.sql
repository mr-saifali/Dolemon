-- ============================================================================
-- Dolemon · migration 017 — private chat media, flip side
-- Run ONLY after the build that exchanges `dolemon-media:<path>` references for
-- signed URLs is live in production. Running it earlier breaks attachments in
-- every old client, because the stored public URLs stop serving.
--
-- What it does:
--   * rewrites `messages.media_url` from a public URL to
--     `dolemon-media:<conversation>/<file>` (new uploads already write this)
--   * makes the `chat-media` bucket private
--
-- Retention: with the bucket private and membership rows gone, nobody can sign
-- an object of a deleted chat. 020 then removes those orphaned objects.
-- ============================================================================

begin;

update public.messages
   set media_url = 'dolemon-media:'
                || split_part(media_url, '/storage/v1/object/public/chat-media/', 2)
 where media_url like '%/storage/v1/object/public/chat-media/%';

update storage.buckets
   set public = false,
       file_size_limit = coalesce(file_size_limit, 26214400)
 where id = 'chat-media';

commit;

-- Absolute public URLs for this bucket stop working the moment `public = false`
-- is committed; the app resolves the new references through signed URLs.
