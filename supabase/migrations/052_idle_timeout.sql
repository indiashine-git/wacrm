-- Account-wide auto sign-out after N minutes of no activity. NULL/0
-- means disabled (today's behavior -- sessions only end on manual
-- logout or the Supabase refresh-token's own multi-week expiry).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER;
