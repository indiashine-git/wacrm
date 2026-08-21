-- Roadmap item 9 (first slice): Razorpay payment-link auto-confirm,
-- explicitly parked earlier tonight. Razorpay's webhook secret is a
-- distinct value from the API key/secret pair (generated separately
-- in their dashboard's Webhooks section) -- needs the raw value at
-- verify time (HMAC), so encrypted like the other secrets, not hashed.
ALTER TABLE commerce_config ADD COLUMN IF NOT EXISTS razorpay_webhook_secret TEXT;

-- The short_url alone can't be matched back to an order from a
-- webhook payload; Razorpay's payment_link.paid event carries the
-- link's internal id, which must be stored at creation time.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_link_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_link ON orders(razorpay_payment_link_id) WHERE razorpay_payment_link_id IS NOT NULL;
