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

## AI Vocabulary Studio (Admin-only)

Open `/admin/ai-studio` after signing in with the local Admin account.
Generation requires a server-side OpenAI API key. Add these **only** to your
untracked `.env.local` on the application host, then restart Next.js:

```dotenv
OPENAI_API_KEY=YOUR_PRIVATE_API_KEY
NIHON_AI_MODEL=gpt-4.1-mini
NIHON_AI_DAILY_LIMIT=10
```

The application never accepts AI provider API keys from web forms or MCP calls,
and never returns them to the browser. Without a configured key, generation is
disabled and the page shows configuration instructions.

Workflow:
1. Admin enters a topic, approximate JLPT level and quantity (1–20 words).
2. Server calls the OpenAI **Responses API** with strict JSON schema and a
   45-second timeout. A 24-hour, SQLite-backed request quota and single-flight
   guard limit accidental spending. No price estimate is presented as a charge.
3. Job and token counts are stored. Generated words are **candidates**, not
   publicly visible vocabulary.
4. Admin edits each candidate, checks possible duplicates and chooses
   **Add as draft** or Reject.
5. Accepted words, Vietnamese/English meanings and Japanese example sentences
   are saved transactionally, linked to the generation job. Publish later in
   `/admin/vocabulary`.

API/network calls are **not** executed in the automated tests. Tests use
an injected fake provider and do not require any real key. Model outputs may be
wrong; require human review. The JLPT label is an approximation.

**Limits / remaining work:** only OpenAI Responses API is wired initially;
no model/provider selection UI, audio/image generation, cost calculation, full
content audit, retries/job resume across process restarts or OAuth for public
MCP. Login still needs persistent rate limiting and security hardening before
internet exposure.

## Flashcard + Spaced Repetition (guest pilot)

The `/practice` page now persists real learning progress in **v2 SQLite**.
Open `/decks` and select a published deck, or use the quick-start button
to add up to 20 previously unstudied published words at a time.

Learning sessions use a signed, `HttpOnly`, `SameSite=Lax` cookie with a
90-day browser lifetime. Configure either `NIHON_GUEST_SESSION_SECRET` (32+
characters, recommended) or `AUTH_SECRET` on the Next.js server. No secret
means the guest study endpoints fail closed with 503. No user ID is supplied by
the browser in a JSON body. Cross-origin POST requests are rejected.

**SRS scheduling:** the same 6-step interval ladder as Nihon v1:
10 minutes, 1 day, 3 days, 7 days, 14 days, 30 days. Wrong answers reset
the streak and schedule another review after 10 minutes. A mastered card
continues repeating every 30 days.

All grading updates are transactional: current schedule, counters and an
immutable review event are written together. Every submission has a unique
request ID so retries cannot double-count a review. A review made before the
next due time returns 409.

### Guest learning API

- `GET /api/v1/me/session`: create/validate a signed guest session.
- `GET /api/v1/me/progress`: counts, due items and next review.
- `GET /api/v1/me/reviews/due?limit=20`: due/new cards with Japanese text
  and Vietnamese meaning (never unpublished vocabulary).
- `POST /api/v1/me/vocabulary/enroll`: enroll next 20 published words.
- `POST /api/v1/me/decks/:id/enroll`: enroll a public deck only.
- `POST /api/v1/me/reviews`: grade a due card with
  `{ "cardId": "UUID", "result": "correct", "requestId": "UUID" }`.
  `wrong` is the other valid result.

**Important limitations:** guest sessions are per browser, not account-bound.
Deleting cookies or changing device loses access to that guest history.
The v1 users, review history, progress and card IDs have **NOT** been migrated.
Remote deployment still needs user accounts, rate limiting, robust backup/
restore, login security hardening and migration acceptance checks.
Do not deploy guest SRS as a production multi-user account solution.

The existing local v2 database was backed up before applying
`004_srs_learning.sql`. Migration only extends the v2 schema; it does not read
or modify the v1 database.

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
- The /practice page persists new guest SRS progress in v2 SQLite; legacy v1 users/SRS/history still have NOT been migrated.
- One-person Admin login, draft approval and public deck publishing are implemented. Multi-user accounts, user/SRS-history migration, full restore drills, alternate AI providers, audio/image generation and production-grade MCP OAuth are not yet implemented.
- MCP integration is intended for trusted clients with a separately configured integration token; remote public exposure requires proper authorization and origin protection.
- Admin endpoint is an interim API-token solution; no public deployment until full authentication, authorization, rate-limiting, backup/restore and import audit are complete.
- The sample seed is intentionally DEV-ONLY. Existing users and production data were not migrated or modified.

## Architecture
All screens, REST routes and MCP transport live inside this Next.js app.
Shared server-side logic is under src/modules, with Drizzle + Node built-in SQLite in src/db.
No NestJS, Express service or second application is required for v2.
