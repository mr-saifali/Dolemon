-- ============================================================================
-- Dolemon · migration 015 — RPC surface + message UPDATE hardening
-- Apply after 004/011. Idempotent: safe to re-run.
--
-- Why this file exists
--   1. `messages_own_update` only checked `sender_id = auth.uid()`. A sender
--      could UPDATE their own row and repoint `conversation_id` at a chat they
--      are not a member of, injecting a message into someone else's thread.
--      The WITH CHECK above now also requires membership of the target room.
--   2. PostgreSQL grants EXECUTE on new functions to PUBLIC, so `revoke ... from
--      anon` alone leaves `anon` able to call app RPCs (an unauthenticated
--      client could call search_users() and enumerate public handles). Revoke
--      from PUBLIC + anon, then grant to authenticated.
--   3. Supabase's default table grants include TRUNCATE/REFERENCES/TRIGGER for
--      anon and authenticated. RLS never protects TRUNCATE.
-- ============================================================================

-- 1) A message may only stay in (or move to) a conversation the sender belongs to.
drop policy if exists "messages_own_update" on public.messages;
create policy "messages_own_update" on public.messages for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid() and is_conversation_member(conversation_id));

-- 2) Signed-in only RPCs. `username_available` stays callable for the pre-auth
--    signup check; `set_account_visibility` is handled by migration 011.
revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.can_see_message(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.open_direct_conversation(text) from public, anon;
revoke execute on function public.delete_conversation(uuid) from public, anon;
revoke execute on function public.reactions_for_conversation(uuid) from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
revoke execute on function public.touch_read_cursor(uuid) from public, anon;
revoke execute on function public.conversation_read_state(uuid) from public, anon;
revoke execute on function public.touch_presence() from public, anon;
revoke execute on function public.set_app_lock(text) from public, anon;
revoke execute on function public.verify_app_lock(text) from public, anon;
revoke execute on function public.search_users(text) from public, anon;
revoke execute on function public.doremon_stats(uuid) from public, anon;
revoke execute on function public.doremon_records() from public, anon;

grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.can_see_message(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.open_direct_conversation(text) to authenticated;
grant execute on function public.delete_conversation(uuid) to authenticated;
grant execute on function public.reactions_for_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.touch_read_cursor(uuid) to authenticated;
grant execute on function public.conversation_read_state(uuid) to authenticated;
grant execute on function public.touch_presence() to authenticated;
grant execute on function public.set_app_lock(text) to authenticated;
grant execute on function public.verify_app_lock(text) to authenticated;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.doremon_stats(uuid) to authenticated;
grant execute on function public.doremon_records() to authenticated;

-- 3) Drop grants the client never needs.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
