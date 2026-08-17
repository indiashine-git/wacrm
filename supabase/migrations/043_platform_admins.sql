-- ============================================================
-- 043_platform_admins.sql — real superadmin accounts
--
-- Replaces the throwaway single-shared-password model
-- (PLATFORM_ADMIN_USER/PASSWORD env vars, migration-040-era) with
-- real per-admin login. `platform_admins` is deliberately NOT part
-- of the tenant auth system (not in auth.users, no row here ever
-- touches `accounts`/`profiles`) — a superadmin signing in must never
-- trigger handle_new_user or count as a tenant.
--
-- Also adds 'suspended' as a 4th accounts.status value: an account
-- that WAS approved and is now paused by an operator, distinct from
-- 'rejected' (never approved in the first place).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS policy needed: this table is only ever read/written by the
-- service-role client (src/lib/platform/admin-client.ts), same as
-- every other /api/platform/* data access. Enabling RLS with zero
-- policies additionally blocks the anon/authenticated roles outright,
-- matching every other approval-gate table's posture.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
  ALTER TABLE accounts
    ADD CONSTRAINT accounts_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'suspended'));
END $$;
