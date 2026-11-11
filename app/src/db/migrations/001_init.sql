PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS vocabulary_entries (
  id TEXT PRIMARY KEY, language TEXT NOT NULL DEFAULT 'ja',
  word TEXT NOT NULL, reading TEXT NOT NULL, romanization TEXT,
  part_of_speech TEXT, jlpt_level TEXT,
  normalized_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','published','archived')),
  source TEXT NOT NULL DEFAULT 'manual', source_ref TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_normalized
  ON vocabulary_entries(language,normalized_key);
CREATE INDEX IF NOT EXISTS idx_vocabulary_status ON vocabulary_entries(status);
CREATE TABLE IF NOT EXISTS vocabulary_senses (
  id TEXT PRIMARY KEY, entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id) ON DELETE CASCADE,
  language TEXT NOT NULL, meaning TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_senses_entry ON vocabulary_senses(entry_id);
CREATE TABLE IF NOT EXISTS decks (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deck_items (
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(deck_id,entry_id)
);
CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL,
  prompt TEXT NOT NULL, status TEXT NOT NULL, requested_count INTEGER NOT NULL,
  created_at TEXT NOT NULL, completed_at TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS generation_candidates (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected'))
);
CREATE TABLE IF NOT EXISTS legacy_id_map (
  old_id TEXT PRIMARY KEY, new_id TEXT NOT NULL REFERENCES vocabulary_entries(id)
);
CREATE TABLE IF NOT EXISTS review_cards (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, entry_id TEXT NOT NULL REFERENCES vocabulary_entries(id),
  status TEXT NOT NULL DEFAULT 'new', next_review_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_user_entry ON review_cards(user_id,entry_id);
CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY, card_id TEXT NOT NULL REFERENCES review_cards(id),
  result TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_events_card ON review_events(card_id);
