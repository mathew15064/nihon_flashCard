-- Preserve original v1 vocabulary JSON exactly, including notes, examples,
-- images and metadata not yet modeled by the v2 schema.
CREATE TABLE IF NOT EXISTS legacy_import_records (
  old_id TEXT PRIMARY KEY REFERENCES legacy_id_map(old_id),
  raw_data TEXT NOT NULL,
  legacy_created_at TEXT,
  legacy_updated_at TEXT,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legacy_imported_at
  ON legacy_import_records(imported_at);
