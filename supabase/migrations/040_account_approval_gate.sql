-- ============================================================
-- 040_account_approval_gate.sql — Gated signup approval
--
-- Adds an approval gate to accounts. New signups default to
-- 'pending' and cannot use the app until an operator approves
-- them via /platform/approvals. Existing accounts (created
-- before this migration) are backfilled to 'approved' so nobody
-- currently using the system gets locked out.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_status_check'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_status_check
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Backfill: every account that existed before this migration is
-- already in active use — grandfather it in as approved.
UPDATE accounts SET status = 'approved', approved_at = COALESCE(approved_at, created_at)
  WHERE status = 'pending' AND created_at < NOW();
