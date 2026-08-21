-- Roadmap item 8: automated payment reminders for unpaid orders --
-- DoubleTick-parity feature discussed earlier tonight. orders has no
-- updated_at, so link_sent_at is added explicitly to know when the
-- reminder window starts; payment_reminder_sent_at prevents the daily
-- cron from nagging the same order twice.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS link_sent_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reminder_sent_at TIMESTAMPTZ;
