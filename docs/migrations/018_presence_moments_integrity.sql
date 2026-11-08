-- ============================================================================
-- Dolemon · migration 018 — presence memory integrity
-- Idempotent. Apply after 010.
--
-- `presence_moments` accepted any `partner_id` from an authenticated client, so
-- one account could write "you were both here" rows into a stranger's presence
-- history. A moment may now only name someone the owner actually shares a
-- conversation with. Owners can also clear their own rows.
-- ============================================================================

drop policy if exists "moments insert" on public.presence_moments;
create policy "moments insert" on public.presence_moments for insert to authenticated
  with check (
    auth.uid() = owner_id
    and partner_id <> owner_id
    and exists (
      select 1
        from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
       where mine.user_id = auth.uid()
         and theirs.user_id = presence_moments.partner_id
    )
  );

drop policy if exists "moments update" on public.presence_moments;
create policy "moments update" on public.presence_moments for update to authenticated
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and partner_id <> owner_id
    and exists (
      select 1
        from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
       where mine.user_id = auth.uid()
         and theirs.user_id = presence_moments.partner_id
    )
  );

drop policy if exists "moments delete" on public.presence_moments;
create policy "moments delete" on public.presence_moments for delete to authenticated
  using (auth.uid() = owner_id);

-- `temporary_chat_videos` deliberately keeps NO foreign keys: the cleanup route
-- finds expired rows and then deletes the storage object, so the metadata must
-- outlive both the conversation and the account.
