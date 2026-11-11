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
- NOT implemented: real user authentication, legacy user/SRS progress migration, publishing workflow, AI provider, AI Studio, full rate limiting or public remote MCP OAuth.
- Do not publish this version to the internet until the missing security and data migration items are resolved.

## Next steps
1. Build proper authentication and authorization and replace interim admin token authentication for UI use.
2. Extend migration from vocabulary into users, progress and SRS review history; verify v1 backups, restore drills, old/new ID counts and a reversible production cutover.
3. Develop deck CRUD, publishing, SRS review events and preserved learning progress.
4. Add batch import and AI generation candidates with cost/quota management and admin preview/approval.
5. Harden remote MCP OAuth, scopes, origin validation, audit and rate limiting.
6. Run integration and end-to-end tests, compare v1/v2 data, then cut over production.
7. Remove legacy Express runtime from the deployment and eventually archive old source.

No destructive migrations and no writes to data/app.db are authorized by this plan.
