# V1 learner and SRS migration — safety plan (not yet implemented)

Status: **SPEC / BLOCKED**. Never infer legacy account ownership from username, display name, or a browser cookie.

## Verified source and destination model

- v1 Express schema (main:server/db/schema.js): users(id, username, display_name, status, created_at, last_active_at); progress(user_id, card_id, content_type, status, times_reviewed, correct_count, wrong_count, streak, last_reviewed_at, next_review_at); history(id, user_id, card_id, content_type, reviewed_at, result).
- v1 users has **no password or verifiable credential**. Its username is only an identifier, never proof of ownership.
- New Fastify DB: learner_accounts, review_cards (one per learner/entry), review_events (per review), legacy_id_map(old_id,new_id), guest_account_merges. Existing guest->learner transfer is **not** a v1 import mechanism.
- The earlier vocabulary import reported 15 old entries mapped, with 13 new and 2 deduplicated, only on the isolated development database. Verify legacy_id_map in the actual migration destination before attempting progress imports.
- On the 2026-11-11 development PC, a v1 users.json fixture was found, but data/app.db containing live v1 progress/history was **not** found in the inspected project worktrees. No live SRS row counts have been verified.

## Implemented inspection-only CLI (2026-11-12)

After building the Fastify app, obtain a *verified, isolated copy* of the v1
SQLite database and run from `app/`:

    npm run build
    npm run db:audit-v1-srs -- --source /secure/legacy/app.db --target ./data/nihon.sqlite

This tool deliberately has **no --apply flag**. Both databases are opened
read-only with query_only and quick_check. It reports aggregate user counts,
progress/history counts, missing vocabulary ID mappings, conflicting cards
introduced by deduplicated vocabulary, orphan references, non-vocabulary
content types, invalid dates/results/counters, discrepancies between review
counters and actual history event counts, and draft/archived destination
entries. It never prints legacy usernames, user IDs or individual events.

The report always sets `ownershipVerified: false` and `canApply: false`.
Resolve all blockers and independently verify ownership before designing any
write-capable migration. The inspection is not a migration or account claim.
Neither this tool nor its tests access the production v1 database.

## Phase A — read-only inventory and reconciliation

1. Obtain the *correct* v1 app.db or a verified immutable snapshot. Open SQLite as read-only; never run v2 migrations against it.
2. Record SHA-256 of source and backup destination, SQLite integrity_check, schema version, table counts and timestamps. Record only aggregate counts in reports, not passwords/tokens or identifiable study history.
3. Check orphaned progress/history (missing user or card), duplicate IDs, content types, invalid timestamps and unexpected result/status values.
4. Join v1 card_id to new legacy_id_map.old_id and group by new entry_id. Fail closed for missing ID mappings and conflicting merged entries. Produce a dry-run report by outcome: mapped, duplicate, orphaned, invalid, ambiguous.
5. Compare per-user review and card counts before/after *in a temporary database only*. Never mark the import successful based on a global row count alone.

## Phase B — ownership verification (separate from data copying)

- Create an explicit legacy-user claim workflow with a 1:1 legacy-user-ID -> learner-ID record and auditable evidence. The new learner must be authenticated; a verified external proof or a manually approved recovery process must establish control of the legacy identity.
- Use single-use, short-lived claim grants; store only hashes of bearer grants. Enforce rate limits and record who approved each claim. Never accept username equality, knowing a public profile name, or current guest cookie as sufficient proof.
- If no credible proof is available, **quarantine** historical data and keep it unassigned rather than expose another user's learning records.
- This phase requires a separately reviewed product/security decision before any account is linked.

## Phase C — migration implementation (future code)

- --dry-run must be the default; --apply requires explicit operator confirmation, a verified destination backup, and an isolated target.
- Use deterministic per-source IDs for imported review events and an import ledger keyed by source fingerprint/version for idempotent retries. Preserve legacy timestamps, status, review counters and original row IDs in an audit mapping.
- Convert each mapped v1 progress row to review_cards, with user_id set only after ownership is verified. Preserve due dates (do not reset SRS schedules). Deduplicated vocabulary requires a documented conflict policy when multiple legacy cards map to one new entry.
- Convert each historical history event to review_events linked to its converted card, without inventing request IDs or replaying SRS scheduling side effects.
- Wrap writes in bounded transactions with conflict-safe inserts. On errors, roll back the transaction; retain the backup. Never modify the original v1 DB.
- Add tests for orphaned IDs, duplicate vocabulary, invalid dates, same-user idempotency, conflicting ownership, disabled accounts, large histories, interrupted imports and rollback.

## Acceptance criteria before beta migration

- Independent account ownership proof is designed and tested; no unauthorized username-based claim.
- Source schema and representative v1 dataset verified read-only.
- Detailed before/after reconciliation matches, including review counts and due dates; exceptions reported explicitly.
- Backup + restore drill and an offline rollback procedure have passed against an isolated copy.
- New guest claim, learner login, vocabulary and SRS tests remain passing.
- No deployment, production database mutation or merge without explicit approval.

This document is a migration gate and mapping plan, **not** an authorization to import accounts or study history.
