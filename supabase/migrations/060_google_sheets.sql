-- Roadmap item 10 (Google Sheets, service-account slice): read/write
-- access to a tenant's own spreadsheet via one Google Cloud service
-- account WATU holds centrally. The tenant shares their sheet with
-- that service account's email (like adding a collaborator) --
-- no per-tenant OAuth consent flow.
CREATE TABLE google_sheets_config (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  -- The service-account JSON key, encrypted. Needs the raw value at
  -- request time (RS256-signs a JWT), so encrypted like other
  -- secrets that require round-tripping, not hashed.
  service_account_json_encrypted TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL DEFAULT 'Sheet1',
  -- Polling cursor for the sheet -> WATU direction (row index already synced, 1 = header only).
  last_synced_row INTEGER NOT NULL DEFAULT 1,
  poll_enabled BOOLEAN NOT NULL DEFAULT false,
  last_tested_at TIMESTAMPTZ,
  last_test_error TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON google_sheets_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE google_sheets_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_sheets_config_select ON google_sheets_config FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY google_sheets_config_insert ON google_sheets_config FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY google_sheets_config_update ON google_sheets_config FOR UPDATE
  USING (is_account_member(account_id, 'admin'));
CREATE POLICY google_sheets_config_delete ON google_sheets_config FOR DELETE
  USING (is_account_member(account_id, 'admin'));
