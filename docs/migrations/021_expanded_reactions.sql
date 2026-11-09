-- Additive reaction range. Old clients keep their original five IDs.
-- No row, RLS, publication, API-key or storage changes.
begin;
alter table public.message_reactions drop constraint if exists message_reactions_reaction_type_check;
alter table public.message_reactions add constraint message_reactions_reaction_type_check
  check (reaction_type in ('dil', 'haha', 'wow', 'aww', 'hype', 'smile', 'grin', 'joy', 'loveeyes', 'kiss', 'blush', 'cool', 'thinking', 'eyes', 'sad', 'cry', 'sob', 'angry', 'rage', 'fear', 'sleep', 'sick', 'skull', 'facepalm', 'shrug', 'thumbsup', 'thumbsdown', 'clap', 'pray', 'strong', 'ok', 'handshake', 'party', 'hundred', 'check', 'heartbreak', 'sparkles'));
commit;
