-- WooCommerce order-sync connector (roadmap item 10, WooCommerce slice).
-- One config row per account: the store URL (informational) + an
-- encrypted webhook secret the admin pastes into WooCommerce's own
-- webhook settings (WP Admin -> WooCommerce -> Settings -> Advanced ->
-- Webhooks). WooCommerce signs each delivery with this secret
-- (base64 HMAC-SHA256 of the raw body), verified in the receiver.

CREATE TABLE IF NOT EXISTS woocommerce_config (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  store_url TEXT NOT NULL,
  webhook_secret_encrypted TEXT NOT NULL,
  last_received_at TIMESTAMPTZ,
  receive_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER woocommerce_config_set_updated_at
  BEFORE UPDATE ON woocommerce_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE woocommerce_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY woocommerce_config_select ON woocommerce_config FOR SELECT USING (is_account_member(account_id));
CREATE POLICY woocommerce_config_insert ON woocommerce_config FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY woocommerce_config_update ON woocommerce_config FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY woocommerce_config_delete ON woocommerce_config FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Lets the webhook receiver upsert on repeat deliveries (WooCommerce
-- resends order.updated on every status transition) instead of
-- creating a duplicate order row each time.
-- A plain (non-partial) unique constraint, not a partial index: multiple
-- NULLs are still allowed (NULL <> NULL), but PostgREST's upsert needs a
-- real constraint name to target with ON CONFLICT -- it can't match an
-- arbitrary partial index.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS woocommerce_order_id TEXT;
ALTER TABLE orders ADD CONSTRAINT orders_account_woocommerce_order_unique
  UNIQUE (account_id, woocommerce_order_id);
