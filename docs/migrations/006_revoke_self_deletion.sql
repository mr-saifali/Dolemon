-- ============================================================================
-- Dolemon · migration 006 — accounts can't delete themselves
-- Run this once in the Supabase SQL editor. Idempotent, safe to re-run.
--
-- The app no longer exposes any self-deletion path, and this drops the
-- delete_my_account() function that migration 004 created, so the account
-- can't be wiped from the client side at all.
--
-- An account is now only ever removed by YOU, an admin, from the Supabase
-- dashboard: Authentication → Users → (user) → Delete user.
-- ============================================================================

drop function if exists public.delete_my_account();
