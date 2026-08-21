-- Lead/Customer segregation + source tracking + WhatsApp opt-in
-- consent, matching what WATI/DoubleTick/Interakt-class tools carry
-- per contact. Every insert path (webhook auto-create, manual add,
-- CSV import, public v1 API) gets contact_type='lead' for free via
-- the column default -- that's the "auto identification" mechanism,
-- no per-call-site changes needed. Promotion to 'customer' happens
-- when an agent marks a deal won, or edits the contact directly.
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'lead'
  CHECK (contact_type IN ('lead', 'customer'));
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_given BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON contacts(account_id, contact_type);
