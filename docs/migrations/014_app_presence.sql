-- Private app-wide online presence. Apply after the base conversation schema.
-- Back up and test in staging before production. Realtime must be enabled.
-- This does not change existing public channels used by other app features.
begin;

drop policy if exists "app presence read for conversation members" on realtime.messages;
create policy "app presence read for conversation members" on realtime.messages
for select to authenticated using (
  realtime.messages.extension = 'presence'
  and exists (
    select 1 from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and (select realtime.topic()) = 'app-presence:' || cm.conversation_id::text
  )
);

drop policy if exists "app presence write for conversation members" on realtime.messages;
create policy "app presence write for conversation members" on realtime.messages
for insert to authenticated with check (
  realtime.messages.extension = 'presence'
  and exists (
    select 1 from public.conversation_members cm
    where cm.user_id = (select auth.uid())
      and (select realtime.topic()) = 'app-presence:' || cm.conversation_id::text
  )
);
commit;
