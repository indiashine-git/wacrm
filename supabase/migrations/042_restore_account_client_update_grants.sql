-- ============================================================
-- 042_restore_account_client_update_grants.sql — undo collateral
-- damage from migration 041
--
-- 041's REVOKE UPDATE ON accounts FROM anon, authenticated was too
-- broad. Its own header comment claimed "no client-session code
-- updates accounts directly anywhere" and "the one legitimate
-- client-facing mutation ... goes through a SECURITY DEFINER RPC" —
-- both false, caught in this branch's final re-review after 041 had
-- already been applied live:
--
--   - PATCH /api/account (src/app/api/account/route.ts) renames the
--     account via the session-scoped (role `authenticated`) Supabase
--     client, relying directly on RLS (accounts_update), not an RPC.
--   - src/components/settings/deals-settings.tsx updates
--     accounts.default_currency the same way, from the browser.
--
-- Both broke in production the moment 041 was applied. This
-- restores UPDATE on exactly those two columns for `authenticated`
-- (never `anon` — both call sites require a session) via a
-- column-level GRANT, which (unlike a column-level REVOKE) DOES
-- correctly narrow permissions when layered after a table-level
-- REVOKE. Every other accounts column stays locked down — in
-- particular status/approved_at/approved_by/rejected_reason are
-- untouched by this grant, so the self-approval hole 041 closed
-- stays closed. RLS (accounts_update, admin membership required)
-- still gates both columns on top of this grant, unchanged.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT UPDATE (name, default_currency) ON accounts TO authenticated;
  END IF;
END $$;
