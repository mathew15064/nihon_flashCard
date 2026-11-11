# Nihon v2 — migration plan

## Decision record
- Product: Japanese vocabulary first; JLPT levels and communication topics are metadata, not separate learning curricula for now.
- Framework: one Next.js 16 full-stack monolith, React, TypeScript, Route Handlers for REST and MCP.
- Database: new SQLite file managed by Drizzle; isolate it from the legacy Express production SQLite file.
- API keys: Admin-managed secrets only on the Next.js server.
- Deployment: a single Next.js server; the old Express app is NOT part of the target production topology.

## Current migration slice
The new app is intentionally isolated in v2/ on this development branch so the production code and real learning data stay untouched.
- Implemented: Next scaffold; SQLite versioned migrations; demo data; vocabulary listing; draft create API behind bearer token; MCP tools behind a separate bearer token; read-only UI; preview-only flashcard; tests and build.
- Added: read-only dry-run and explicit-apply import from legacy SQLite OR tracked vocabulary JSON; automatic v2 destination backup; legacy ID mapping; raw source JSON preservation; draft-only imports; idempotency checks and tests.
- Added: single-Admin Auth.js login (hashed server-only password and signed cookie), Admin draft approval, private deck management and public deck publishing with integrity checks. Public API returns only public decks and published entries.
- Added: Admin-only AI Vocabulary Studio with OpenAI Responses structured output, SQLite generation jobs/candidates, editing, duplicate checks, accepting as drafts with examples, generation request quota and safe provider failure codes. Tests use a fake provider; no real API key is supplied.
- NOT implemented: multi-user accounts/RBAC, legacy user/SRS progress migration, full editorial audit, AI cost accounting, model/provider chooser, login rate limiting or public remote MCP OAuth.
- Do not publish this version to the internet until the missing security and data migration items are resolved.

## Next steps
1. Harden the one-admin login with persistent anti-brute-force protections, auditing and secure deployment; later introduce multi-user RBAC when needed.
2. Extend migration from vocabulary into users, progress and SRS review history; verify v1 backups, restore drills, old/new ID counts and a reversible production cutover.
3. Expand deck editing/archiving and content review audit; implement SRS review events and preserve learning progress.
4. Expand AI Studio with import/enrichment batches, accurate cost accounting, provider adapters, managed retries and content audit.
5. Harden remote MCP OAuth, scopes, origin validation, audit and rate limiting.
6. Run integration and end-to-end tests, compare v1/v2 data, then cut over production.
7. Remove legacy Express runtime from the deployment and eventually archive old source.

No destructive migrations and no writes to data/app.db are authorized by this plan.
