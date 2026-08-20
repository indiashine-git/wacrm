-- Click-to-WhatsApp ad attribution. Meta includes a `referral` object
-- on the first inbound message when a chat started from a CTWA ad
-- (source_id/source_url/headline/source_type/ctwa_clid). First-touch
-- only -- once set, never overwritten by a later message.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral JSONB;
