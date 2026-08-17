-- ============================================================
-- 040_account_approval_gate.sql — Gated signup approval
--
-- Adds an approval gate to accounts. New signups default to
-- 'pending' and cannot use the app until an operator approves
-- them via /platform/approvals. Existing accounts (created
-- before this migration) are backfilled to 'approved' so nobody
-- currently using the system gets locked out.
--
-- Idempotent — safe to run multiple times. Backfill is gated on
-- creation timestamp to prevent re-runs from auto-approving genuine
-- pending signups.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
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

-- Backfill: every account created before this migration was written
-- (2026-08-17) is already in active use — grandfather it in as approved.
-- Idempotent: re-runs will not approve accounts created after this date.
UPDATE accounts SET status = 'approved', approved_at = COALESCE(approved_at, created_at)
  WHERE status = 'pending' AND created_at < '2026-08-17T00:00:00Z';
