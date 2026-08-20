-- Persists the inbox contact-details panel width per user (not per
-- browser/localStorage) so a dragged size survives logout and follows
-- the user across devices, same as any other account preference.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_panel_width INTEGER NOT NULL DEFAULT 280;
