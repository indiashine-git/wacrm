-- Real Meta WhatsApp Flows (the native in-chat form product) have no
-- run-count / execution-log API of their own -- Meta only tracks a
-- Flow's publish status, nothing about individual sends or
-- submissions. This table is wacrm's own send/submission log, giving
-- Flows the same "N runs, last Xh ago" + drill-down logs UX that
-- Automations and the Chatbot builder already have, sourced from data
-- we actually control (our own send call + the nfm_reply webhook).

CREATE TABLE IF NOT EXISTS flow_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  flow_id TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  -- Unique per send, echoed back by Meta in the nfm_reply submission --
  -- how the webhook matches a completion back to the send that
  -- prompted it.
  flow_token TEXT NOT NULL UNIQUE,
  to_phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'submitted', 'failed')),
  submitted_fields JSONB,
  whatsapp_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_flow_sends_account ON flow_sends(account_id);
CREATE INDEX IF NOT EXISTS idx_flow_sends_flow ON flow_sends(flow_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_flow_sends_token ON flow_sends(flow_token);

ALTER TABLE flow_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_sends_select ON flow_sends FOR SELECT USING (is_account_member(account_id));
CREATE POLICY flow_sends_insert ON flow_sends FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY flow_sends_update ON flow_sends FOR UPDATE USING (is_account_member(account_id, 'admin'));
