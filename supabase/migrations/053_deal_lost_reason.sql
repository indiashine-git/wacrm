-- Mandatory lost-reason capture when a deal is marked lost -- lets a
-- manager actually see why deals are dying (price, competitor, no
-- budget, etc.) instead of just a count of losses.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS lost_reason TEXT;
