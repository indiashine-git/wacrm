-- Roadmap item 13: deal probability % (standard across Salesforce/
-- HubSpot/Pipedrive -- a default per stage, editable per deal, so
-- value * probability gives a real weighted-forecast number) and a
-- Hot/Warm/Cold priority tag (a separate, qualitative signal reps use
-- to triage follow-ups, not a forecasting input).
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS default_probability INTEGER NOT NULL DEFAULT 0
  CHECK (default_probability BETWEEN 0 AND 100);

ALTER TABLE deals ADD COLUMN IF NOT EXISTS probability INTEGER
  CHECK (probability BETWEEN 0 AND 100);
ALTER TABLE deals ADD COLUMN IF NOT EXISTS priority TEXT
  CHECK (priority IN ('hot', 'warm', 'cold'));
