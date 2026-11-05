-- Dolemon migration 011: correct visibility and deletion-proof private memory.
-- Run only after migrations 004, 008 and 010. Back up and test in staging first.
-- Existing memory is preserved when a conversation is deleted. Storage objects
-- are NOT deleted by this migration and may still be public.

begin;

-- Positional argument avoids ambiguity with the profiles.visibility column.
create or replace function public.set_account_visibility(visibility text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
  if $1 not in ('public', 'private') or $1 is null then raise exception 'INVALID_VISIBILITY'; end if;
  update public.profiles p set visibility = $1 where p.id = auth.uid();
end;
$$;
revoke execute on function public.set_account_visibility(text) from public, anon;
grant execute on function public.set_account_visibility(text) to authenticated;

-- Retain the original conversation UUID as a historical reference. The 010
-- NO ACTION foreign key prevented deleting chats with a memory row.
alter table public.doremon_memory drop constraint if exists doremon_memory_conversation_id_fkey;

-- Owners can read/delete retained records. A new or modified record may only
-- be written while its owner is a member of that conversation.
drop policy if exists "doremon record is private" on public.doremon_memory;
drop policy if exists "doremon read own" on public.doremon_memory;
drop policy if exists "doremon delete own" on public.doremon_memory;
drop policy if exists "doremon insert own member" on public.doremon_memory;
drop policy if exists "doremon update own member" on public.doremon_memory;
create policy "doremon read own" on public.doremon_memory for select using (user_id = auth.uid());
create policy "doremon delete own" on public.doremon_memory for delete using (user_id = auth.uid());
create policy "doremon insert own member" on public.doremon_memory for insert with check (
  user_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = doremon_memory.conversation_id and cm.user_id = auth.uid())
);
create policy "doremon update own member" on public.doremon_memory for update using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists (select 1 from public.conversation_members cm where cm.conversation_id = doremon_memory.conversation_id and cm.user_id = auth.uid())
);

commit;
