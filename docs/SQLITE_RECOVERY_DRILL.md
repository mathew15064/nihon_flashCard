# Nihon SQLite recovery drill — backup/restore without cutover

This is a **disposable, read-only rehearsal** for the Fastify SQLite database.
It is not a scheduled backup, migration of v1 user history, or a production
restore/cutover plan.

## Operator invocation

From `app/`, after `npm run build`:

```bash
mkdir -m 700 -p /secure/private-qa-scratch
npm run db:drill -- --source ./data/nihon.sqlite --scratch-dir /secure/private-qa-scratch
```

Use an explicitly approved source and a separate protected scratch filesystem
with sufficient free space for **two copies** of the source DB. Verify the
directory is writable by the Fastify operator and not shared/public. Prefer
a verified *staging snapshot* as the source rather than the live DB.
Run this rehearsal only in a planned maintenance/testing window for production
systems. The command refuses missing source/scratch paths, never creates a
source database, and never overwrites a pre-existing file.

The drill creates a random 0700 directory in the supplied scratch root,
performs SQLite's online backup (including committed WAL data) into a
new 0600 file, restores that backup to a second new file, and then checks
**both** copies for:

- `PRAGMA integrity_check` (whole SQLite DB)
- `PRAGMA foreign_key_check`
- exact `schema_migrations` filenames and SHA-256 of all versioned migration
  SQL files in the running checkout
- schema object definitions, full table row counts, and content SHA-256
  digests using deterministic row ordering

The result contains **only aggregates**:

```json
{"ok":true,"tables":18,"rows":120,"migrations":6,"matching":true}
```

Numbers above are *illustrative only*. No username, token, password verifier,
learning history, source path, or row digest is printed. **All scratch copies
are deleted** on success or failure; this command does not retain a backup.

This is a source **read-only** operation: it does not apply migrations, change
`DB_PATH`, switch files, issue HTTP requests, restart a process, or deploy
anything. It does not touch the v1 Express database or its original repository.

## Separate retained backup

To create an actual retained backup, explicitly run the existing non-overwrite
command to a secure external volume:

```bash
npm run db:backup -- --source ./data/nihon.sqlite --target /secure/backups/nihon-2026-11-12.sqlite
```

Verify the file exists, has 0600 permissions, is encrypted at rest by the
operator's storage system, and can be independently restored. Do not rely on a
single live-volume backup. Keep recovery objectives, retention and offsite copy
policies outside application source control.

## Production rollback gate (not automated)

1. Record source DB identity, Git commit, schema migration checksums, volume,
   external backup location, and maintenance approval.
2. Stop writes and the application before any manual cutover. Confirm latest
   WAL checkpoint/backup is complete. Avoid renaming files while Node is live.
3. Restore **into a new location**, run `db:drill` against the restored DB,
   check counts and a representative user journey in an isolated instance.
4. Only with an approved procedure, switch `DB_PATH` to the reviewed
   restored copy and restart the *same* single Fastify process.
5. Validate health, Admin/learner access, vocabulary, due queue, SRS events,
   MCP and AI integration quotas; document a reversal procedure.

**Current status:** the CLI and deterministic tests have been exercised with
synthetic temporary SQLite data only. A true production backup and restore
certification requires operator-supplied real snapshots and maintenance approval.
