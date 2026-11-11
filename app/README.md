# Nihon — Fastify + React + Vite Monolith

One Fastify process serves the built React SPA, REST API, MCP endpoint and
server-side AI integration. SQLite + Drizzle persist content and SRS.
There is no Next.js, NestJS or Express runtime in this application.

## Local development

Requirements: Node.js >=22.12, npm.

From the app directory:

    npm ci
    npm run db:migrate
    npm run db:seed:demo     # optional, DEV-ONLY samples
    npm run dev

Open http://127.0.0.1:3000. Development also runs one Fastify port;
Vite is attached as middleware in that same process.

Production build and checks:

    npm run typecheck
    npm test
    npm run lint
    npm run build
    NODE_ENV=production npm start

## Secrets

Copy .env.example to .env.local and keep it private.
Fastify loads .env.local before DB and application modules.

Generate a random secret:

    node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'

Use it as AUTH_SECRET (32+ characters). Generate another unique secret for
NIHON_MCP_TOKEN if MCP is needed, and NIHON_ADMIN_TOKEN for trusted REST
integrations. These are unrelated to the AI provider secret.

Generate an Admin password hash with no plaintext in shell argv:

    read -sr -p 'Admin password: ' ADMIN_PW; echo
    printf '%s' "$ADMIN_PW" | npm run admin:hash
    unset ADMIN_PW

Set NIHON_ADMIN_PASSWORD_HASH to the output. There is no default password.
Admin login: /admin/login. Learner login: /account/login.
Learner registration: /account/register, disabled until the server is
explicitly configured with NIHON_ENABLE_SIGNUP=true.

Signed HttpOnly cookies are used for Admin (8h), learner (30d) and guest
learning (90d). POST/PATCH browser requests require a matching Origin.
Login lockouts and local signup quota live in SQLite. A bounded per-process IP limit covers Admin/learner login and registration;
account-level lockouts persist in SQLite. Because trustProxy is false, traffic
from a reverse proxy shares the proxy's IP bucket; configure trusted edge IP
rate limiting as well. OAuth, recovery and broader abuse review are pending.

## AI Studio

Use /admin/ai-studio. Configure OPENAI_API_KEY only on the server,
plus NIHON_AI_MODEL (default gpt-4.1-mini) and NIHON_AI_DAILY_LIMIT
(default 10 jobs per rolling 24h). No client API key field exists.
The backend requests structured Japanese vocabulary from OpenAI Responses
API, validates and deduplicates, stores candidates, and lets Admin edit,
accept as drafts, reject and publish separately.

Tests use a fake AI provider. No real key billing or model behavior has
been validated in this migration.

## Features / APIs

Public:
- GET /api/v1/health
- GET /api/v1/vocabulary and /api/v1/vocabulary/:id
- GET /api/v1/decks and /api/v1/decks/:id

Auth:
- GET /api/v1/auth/me
- POST /api/v1/auth/admin/login
- POST /api/v1/auth/learner/login and /register
- POST /api/v1/auth/logout

Admin:
- GET,POST /api/v1/admin/vocabulary
- POST /api/v1/admin/vocabulary/:id/publish
- GET,POST /api/v1/admin/decks
- GET /api/v1/admin/decks/:id
- POST /api/v1/admin/decks/:id/entries and /publish
- GET /api/v1/admin/ai/config, /jobs, /jobs/:id
- POST /api/v1/admin/ai/jobs
- PATCH /api/v1/admin/ai/candidates/:id
- POST /api/v1/admin/ai/candidates/:id/accept or /reject

Learning:
- GET /api/v1/me/session, /progress, /reviews/due
- POST /api/v1/me/vocabulary/enroll
- POST /api/v1/me/decks/:id/enroll
- POST /api/v1/me/reviews
- POST /api/v1/me/claim-guest

MCP Streamable HTTP at POST /mcp, using a separate integration token:
tools vocabulary_search, vocabulary_get, vocabulary_create_draft.
Write tools only create drafts; publishing is Admin-only. Do not expose
remote public MCP without OAuth/scopes and proxy/Host/Origin hardening.

SRS uses the six v1-compatible review intervals, a due queue, separate
per-user cards, retry idempotency and transactional history. A learner can
explicitly claim this browser's guest progress. No automatic v1 account
matching is attempted because v1 usernames are not identity proof.

## Safe v1 vocabulary import

Old v1 content may be imported into a new SQLite database as drafts.
The source SQLite database is opened read-only. Apply creates a destination
backup, keeps legacy ID mappings, preserves source JSON and avoids duplicates.

Preview (read-only):

    npm run import:legacy -- --source ../data/content/vocabulary.json --target ./data/nihon.sqlite

Explicitly apply only after reviewing the report:

    npm run import:legacy -- --source ../data/content/vocabulary.json --target ./data/nihon.sqlite --apply

Production user accounts, history and review state from v1 have NOT yet been
migrated or safely associated with new learner accounts.

## Docker: one container

    docker build -t nihon-fastify .
    docker run --rm -p 127.0.0.1:3000:3000 --env-file .env.production -v nihon-data:/opt/nihon/data nihon-fastify

Keep the env file private and set PUBLIC_ORIGIN to your external HTTPS origin
behind the reverse proxy. Without it, browser state-changing requests are
denied in production. Image entrypoint runs SQLite migrations and starts
one non-root Fastify process. Store the DB in a persistent volume.

## SQLite backup and restore (no overwrite)

After `npm run build`, the backup CLI uses Node's SQLite online backup API,
so it includes committed WAL changes without touching the source database:

    npm run db:backup -- --source ./data/nihon.sqlite --target /secure/backups/nihon-backup.sqlite

Restore **only into a new file** for a verification drill:

    npm run db:restore -- --source /secure/backups/nihon-backup.sqlite --target ./data/nihon-restored.sqlite

Both commands refuse existing destination paths and require an existing parent
directory. Copies use 0600 permissions and must pass SQLite integrity_check;
failed copies are discarded. Restore never replaces the running DB, updates
DB_PATH, or deploys anything. For cutover, stop the application, verify the
restored copy and counts on an isolated instance, then explicitly choose a
rollback/cutover procedure. Mount a separate protected backup location when
running in Docker; do not keep the only backup inside the live SQLite volume.

## Verification

    npm run typecheck
    npm test
    npm run lint
    npm run build

The HTTP smoke script only works on localhost and mutates an isolated test DB:

    SMOKE_ENABLE=yes node scripts/smoke-http.mjs

Current limitations: production login abuse prevention, OAuth for remote MCP,
v1 user/progress migration, approved rollback plan, real AI key E2E and
production load test. The v1 Express runtime in the repository is reference
code only; deploy only the Fastify application from this directory.
