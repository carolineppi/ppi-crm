ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS submittals jsonb NOT NULL DEFAULT '[]'::jsonb;
