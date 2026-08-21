-- Customer Success & Lifecycle module (roadmap item 7, first slice):
-- subscriptions/renewals + AMC/warranty tracking, unified into one
-- table -- both are "this contact has an ongoing commitment with a
-- renewal date," just different vocabulary for the same shape. Churn
-- capture mirrors the deal lost_reason pattern already shipped
-- tonight (mandatory reason on cancel).
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  renewal_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  cancellation_reason TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_account ON subscriptions(account_id);
CREATE INDEX idx_subscriptions_contact ON subscriptions(contact_id);
CREATE INDEX idx_subscriptions_renewal ON subscriptions(account_id, renewal_date) WHERE status = 'active';

CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY subscriptions_insert ON subscriptions FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY subscriptions_update ON subscriptions FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY subscriptions_delete ON subscriptions FOR DELETE
  USING (is_account_member(account_id, 'agent'));
