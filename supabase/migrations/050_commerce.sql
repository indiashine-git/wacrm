-- WhatsApp catalog + in-chat orders/payments. Two real gaps vs
-- competitors (WATI/DoubleTick/Interakt all sell this hard):
--   1. Sending a Meta Commerce Manager catalog in-chat (needs a
--      catalog_id from Meta Business Suite -- wacrm doesn't own or
--      store products, just references Meta's catalog).
--   2. Turning the resulting Meta `order` message into something the
--      CRM tracks, plus a way to actually collect payment for it.
--
-- Payment is provider-agnostic on purpose: Razorpay needs real API
-- keys per account (most India merchants), UPI needs only the
-- merchant's own VPA (zero external account, works same-day).

CREATE TABLE IF NOT EXISTS commerce_config (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  catalog_id TEXT,
  payment_provider TEXT NOT NULL DEFAULT 'none' CHECK (payment_provider IN ('none', 'razorpay', 'upi')),
  razorpay_key_id TEXT,
  -- Encrypted at rest the same way whatsapp_config.access_token is
  -- (src/lib/whatsapp/encryption.ts) -- only ever written/read server-side.
  razorpay_key_secret TEXT,
  upi_vpa TEXT,
  upi_payee_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE commerce_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY commerce_config_select ON commerce_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY commerce_config_insert ON commerce_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY commerce_config_update ON commerce_config FOR UPDATE USING (is_account_member(account_id, 'admin'));

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  catalog_id TEXT,
  -- One row per product_retailer_id from Meta's order message:
  -- [{ product_retailer_id, quantity, item_price, currency }]
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  -- The optional free-text note Meta attaches to the order message.
  customer_note TEXT,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'link_sent', 'paid')),
  payment_link TEXT,
  payment_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY orders_select ON orders FOR SELECT USING (is_account_member(account_id));
CREATE POLICY orders_insert ON orders FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY orders_update ON orders FOR UPDATE USING (is_account_member(account_id, 'agent'));
