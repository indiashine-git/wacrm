-- ============================================================
-- 041_lock_account_approval_columns.sql — close a self-approval hole
--
-- Migration 040 added accounts.status (+ approved_at/approved_by/
-- rejected_reason) but the existing accounts_update RLS policy
-- (017_account_sharing.sql) allows any account admin/owner to UPDATE
-- their own account row — which every fresh signup is, of their own
-- pending account. Without this, a pending user could PATCH their
-- own row through PostgREST directly (bypassing the app entirely)
-- and set status='approved' themselves, defeating the gate.
--
-- Fix: REVOKE UPDATE on the whole accounts table from the roles
-- PostgREST uses for ordinary requests (anon, authenticated). This
-- is safe — confirmed via a full grep of the app codebase and every
-- migration: no client-session code updates accounts directly
-- anywhere. The one legitimate client-facing mutation (renaming an
-- account, migration 018) goes through a SECURITY DEFINER RPC, which
-- runs as the function owner and is unaffected by table grants. The
-- service-role client (used by /api/platform/* and notify()) also
-- bypasses RLS/grants entirely and is unaffected.
--
-- (A column-level REVOKE was tried first and does NOT work here —
-- Postgres does not let a column-level REVOKE narrow a privilege
-- that was granted at the table level; the table-level grant still
-- wins. Confirmed live: after a column-level REVOKE,
-- information_schema.column_privileges still showed UPDATE granted
-- to anon/authenticated on all four columns. Revoking the whole
-- table-level UPDATE privilege is the only mechanism that actually
-- removes it.)
--
-- Idempotent — safe to run multiple times.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE UPDATE ON accounts FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE UPDATE ON accounts FROM authenticated;
  END IF;
END $$;
