-- Inbound webhook receiver framework (roadmap item 6). Unlike the
-- existing api_keys, this needs the raw secret at verify time (HMAC
-- signature check), not just a one-way hash -- so the secret is
-- stored encrypted (same AES-256-GCM helper as whatsapp_config's
-- access_token), never in plaintext.
CREATE TABLE inbound_webhooks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  last_received_at TIMESTAMPTZ,
  receive_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inbound_webhooks_account ON inbound_webhooks(account_id);

ALTER TABLE inbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY inbound_webhooks_select ON inbound_webhooks FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY inbound_webhooks_insert ON inbound_webhooks FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY inbound_webhooks_delete ON inbound_webhooks FOR DELETE
  USING (is_account_member(account_id, 'admin'));
