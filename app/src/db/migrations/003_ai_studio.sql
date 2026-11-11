-- AI generation jobs retain bounded request metadata and API usage statistics.
ALTER TABLE generation_jobs ADD COLUMN params_json TEXT;
ALTER TABLE generation_jobs ADD COLUMN input_tokens INTEGER;
ALTER TABLE generation_jobs ADD COLUMN output_tokens INTEGER;
ALTER TABLE generation_candidates ADD COLUMN accepted_entry_id TEXT REFERENCES vocabulary_entries(id);

-- Keep examples attached to an accepted vocabulary entry, not just a transient AI candidate.
CREATE TABLE IF NOT EXISTS vocabulary_examples (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  translation_vi TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX IF NOT EXISTS idx_vocabulary_examples_entry ON vocabulary_examples(entry_id);
CREATE INDEX IF NOT EXISTS idx_generation_candidates_job ON generation_candidates(job_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_created ON generation_jobs(created_at);
