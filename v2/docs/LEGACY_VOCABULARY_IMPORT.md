# Nihon v2 — Safe Legacy Vocabulary Import

This is a **development-stage** migration utility for vocabulary only.
The original Nihon v1 application and its learning database are never written.

## Supported sources
- v1 SQLite `data/app.db` with a `content` table containing `content_type='vocabulary'`.
- v1 tracked `data/content/vocabulary.json` array if the SQLite database is not available on the development PC.

## Commands

Run from `v2/`:

```bash
npm ci
npm run db:migrate

# Preview only. Prints counts and issues; does NOT change source or target.
npm run import:legacy -- --source ../data/content/vocabulary.json --target ./data/nihon.sqlite

# Apply to v2 only, after inspecting the dry run.
npm run import:legacy -- --source ../data/content/vocabulary.json --target ./data/nihon.sqlite --apply

# For the v1 production DB, first obtain a trusted snapshot of app.db;
# NEVER make the target path point to a live legacy database.
npm run import:legacy -- --source /safe/v1/app.db --target ./data/nihon.sqlite
```

If a source row is invalid, `--apply` refuses to run. `--allow-skips` explicitly
permits an incomplete import; it should not be used for a production cutover.

## Guarantees
- Reads SQLite source with `readOnly: true`; JSON source is only read as text.
- Default operation is dry-run (no mutations).
- Requires an already-initialized, **separate** destination.
- Creates a SQLite-consistent backup of the **destination**, with file permissions 0600,
  before applying changes. Backup is stored beside `nihon.sqlite`.
- Wraps imported entries, ID mappings and raw source payloads in one transaction.
- Maps legacy IDs to a v2 entry even when its normalized word already exists.
- Stores exact SQLite `content.data` JSON, or complete reserialized JSON item from
  the tracked array, in `legacy_import_records.raw_data` for follow-up processing.
- Imported words are **draft** by default. Existing published words are not silently
  changed when a legacy record shares their normalized key.
- Repeating the same import is idempotent; changed previously imported source records
  fail rather than silently overwrite the preserved originals.

## Data interpretation
- v1 `meaningVi` becomes Vietnamese `vocabulary_senses`.
- v1 `meaning` is treated as English, as documented in v1 data model.
- Missing readings are inferred ONLY for kana-only words. Kanji without a reading
  are flagged as invalid rather than guessed.
- Legacy `category`, `lesson`, `notes`, images and example sentences are preserved in
  raw JSON until a separate reviewed mapping is implemented.
- Explicit JLPT labels can be mapped; do not infer JLPT from legacy lesson numbers.

## Not migrated
- User accounts and authentication
- Per-user card progress and review events / SRS scheduling
- Hiragana, Katakana and standalone Kanji records
- Public publishing decisions or owner-specific decks

**Do not replace the live app or delete the original database based on this tool alone.**
Full progress and history migration, ownership mapping, publisher workflow,
restore drills and production access control are pending.
