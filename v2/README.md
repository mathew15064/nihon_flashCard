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

Open http://localhost:3000, /vocabulary, /decks, or /practice.

## Admin authentication and publishing (local)

Nihon v2 has a **single local Admin** at /admin/login. Login uses Auth.js
credentials with a password hash in a server-only environment variable.
There is no default password.

Generate a session secret and password hash locally. In bash:

```bash
# Run from v2/ and keep the generated values private.
node -e 'console.log(require("node:crypto").randomBytes(40).toString("base64url"))'
read -sr -p 'Strong admin password: ' ADMIN_PW; echo
printf '%s' "$ADMIN_PW" | npm run admin:hash
unset ADMIN_PW
```

Copy the generated hash and random session secret into the server's ignored
`.env.local` (start from `.env.example`), then restart the app:

```text
AUTH_SECRET=<unique-random-secret>
NIHON_ADMIN_PASSWORD_HASH=<the-scrypt-hash-output>
```

The login password never belongs in Git, shell command arguments or browser
storage. Sessions use HttpOnly cookies with an eight-hour lifetime. Mutations
run on the server and verify the Admin session; imported words remain drafts
until explicitly approved.

- `/admin/vocabulary`: create manual drafts and approve vocabulary.
- `/admin/decks`: create private decks, attach entries and publish decks.
- `/decks`: public listing; private decks remain hidden.
- `GET /api/v1/decks`: public decks only.
- `GET /api/v1/decks/:id`: published entries of a public deck.

**Scope/security:** This is a one-admin development milestone, not full
multi-user RBAC. Remote exposure still requires login rate limiting, HTTPS,
reverse-proxy safeguards, CSRF/origin review and production deployment checks.
The legacy bearer-token admin API and MCP integration tokens are separate
from Admin web login; they remain disabled when their secrets are unset.

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
- One-person Admin login, draft approval and public deck publishing are implemented. Multi-user accounts, user/SRS-history migration, full restore drills, AI generation, provider keys and production-grade MCP OAuth are not yet implemented.
- MCP integration is intended for trusted clients with a separately configured integration token; remote public exposure requires proper authorization and origin protection.
- Admin endpoint is an interim API-token solution; no public deployment until full authentication, authorization, rate-limiting, backup/restore and import audit are complete.
- The sample seed is intentionally DEV-ONLY. Existing users and production data were not migrated or modified.

## Architecture
All screens, REST routes and MCP transport live inside this Next.js app.
Shared server-side logic is under src/modules, with Drizzle + Node built-in SQLite in src/db.
No NestJS, Express service or second application is required for v2.
