# Nihon Vocabulary v2 — Next.js Monolith (development branch)

This directory is the single-framework Next.js 16 replacement for the legacy Express app.
The legacy root app remains untouched only during migration. Do not deploy both stacks.
No shared database paths: v2 uses v2/data/nihon.sqlite, never the original data/app.db.

## Requirements
- Node.js 22.5+
- npm

## Local setup
1. cd v2
2. npm ci
3. npm run db:migrate
4. npm run db:seed:demo (optional DEV-ONLY sample entries)
5. npm run dev

Open http://localhost:3000, /vocabulary, or /practice.

## Safe v1 vocabulary import

Legacy JSON and SQLite vocabulary sources can be imported into the separate v2
database with automatic destination backup and ID mapping. This does **not**
migrate user profiles or SRS history.

From the v2 directory, first run a preview:

```bash
npm run import:legacy -- --source ../data/content/vocabulary.json --target ./data/nihon.sqlite
```

After checking the report, apply explicitly:

```bash
npm run import:legacy -- --source ../data/content/vocabulary.json --target ./data/nihon.sqlite --apply
```

Imported entries are drafts. Full details: [Legacy Import Guide](docs/LEGACY_VOCABULARY_IMPORT.md).

## Checks
- npm run typecheck
- npm run lint
- npm test
- npm run build

## Available APIs
- GET /api/v1/health — health check
- GET /api/v1/vocabulary?search=...&jlpt=N5&page=1&limit=30 — published content only
- GET /api/v1/vocabulary/:id — published content only
- GET /api/v1/admin/vocabulary — admin-token-gated, includes drafts
- POST /api/v1/admin/vocabulary — admin-token-gated draft creation with validation and duplicate detection
- POST /mcp — bearer-token-gated MCP tools: vocabulary_search, vocabulary_get, vocabulary_create_draft

Generate separate high-entropy credentials in your server environment:
- NIHON_ADMIN_TOKEN: random secret, at least 24 characters
- NIHON_MCP_TOKEN: different random secret, at least 24 characters

Do not commit keys. Requests without configured secrets are rejected.

## Current limitations
- The /practice page is a non-persistent flashcard preview; legacy SRS/progress have NOT been migrated.
- Admin UI login, user/SRS-history migration, full restore drills, AI generation, provider keys, draft publishing and production-grade MCP OAuth are not yet implemented.
- MCP integration is intended for trusted clients with a separately configured integration token; remote public exposure requires proper authorization and origin protection.
- Admin endpoint is an interim API-token solution; no public deployment until full authentication, authorization, rate-limiting, backup/restore and import audit are complete.
- The sample seed is intentionally DEV-ONLY. Existing users and production data were not migrated or modified.

## Architecture
All screens, REST routes and MCP transport live inside this Next.js app.
Shared server-side logic is under src/modules, with Drizzle + Node built-in SQLite in src/db.
No NestJS, Express service or second application is required for v2.
