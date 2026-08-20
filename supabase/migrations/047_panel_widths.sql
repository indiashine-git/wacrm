-- Generalizes the single-purpose contact_panel_width column (046) to
-- every resizable panel in the app (contact details, conversation
-- list, main nav sidebar) via one JSON map keyed by panel id, so
-- adding another resizable panel later doesn't need a new column.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS panel_widths JSONB NOT NULL DEFAULT '{}'::jsonb;
