# Nihon — Fastify + React + Vite Monolith

One Fastify process serves the built React SPA, REST API, MCP endpoint and
server-side AI integration. SQLite or MySQL 8.4 + Drizzle persist content and SRS.
There is no Next.js, NestJS or Express runtime in this application.

## Local development

Requirements: Node.js >=22.12, npm.

From the app directory:

    npm ci
    npm run dev

Open http://127.0.0.1:3000. On first startup the server automatically
creates a private configuration volume, applies bootstrap SQLite migrations and
generates its authentication/encryption secret. The browser shows /setup:
enter the one-time code printed in private server logs, choose **SQLite or MySQL**,
then create the Admin account. SQLite needs no database server. MySQL requires
an existing empty MySQL 8.4 database and credentials, tested and saved through
the wizard. All application data goes to the selected engine. MySQL keeps only
the **encrypted connection configuration** in local bootstrap SQLite so it can
reconnect after restart without an environment file.

No source/.env editing is needed for a fresh installation.
See docs/UI_FIRST_INSTALL.md; preserve BOTH the local bootstrap volume/secret
and the MySQL database when backing up MySQL installations.

Optional development-only sample data after setup: npm run db:seed:demo

Development also runs one Fastify port;
Vite is attached as middleware in that same process.

Production build and checks:

    npm run typecheck
    npm test
    npm run lint
    npm run build
    NODE_ENV=production npm start

## Secrets

A fresh installation requires **no .env file**. Use the first-run wizard and
Admin → Settings to configure the website, learner signup, OpenAI API key,
AI model/quota and MCP/API integration tokens.

For existing deployments, .env.local remains an optional compatibility /
advanced-operations mechanism; do not commit it. UI-saved settings override
matching environment fallbacks. Server encryption and cookie secrets are
automatically generated and stored in data/instance-secret.key (0600);
back up this key safely along with the selected database. If using MySQL,
also retain the encrypted local bootstrap SQLite settings. See
docs/UI_FIRST_INSTALL.md.

Generate a random secret:

    node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'

For advanced/manual deployments only, AUTH_SECRET (32+ characters) can
override automatic instance key generation. Prefer Admin → Settings to
create/rotate NIHON_MCP and REST integration tokens. These are unrelated
to the AI provider secret.

Generate an Admin password hash with no plaintext in shell argv:

    read -sr -p 'Admin password: ' ADMIN_PW; echo
    printf '%s' "$ADMIN_PW" | npm run admin:hash
    unset ADMIN_PW

Existing deployments may set NIHON_ADMIN_PASSWORD_HASH to the output.
For new installations, create the Admin password in the /setup wizard;
there is no default password. Admin login: /admin/login.
Learner login: /account/login.
Learner registration: /account/register, enabled in the setup wizard or
Admin → Settings. Existing advanced deployments may use NIHON_ENABLE_SIGNUP=true
as a fallback if no UI setting is present.
Learner password change: /account/security, only for an authenticated learner
who knows the current password. Changing it revokes sessions on other devices
and rotates the active browser session. Unverified password reset is not
available; see docs/ACCOUNT_SECURITY.md.

Signed HttpOnly cookies are used for Admin (8h), learner (30d) and guest
learning (90d). Admin/learner sessions additionally require hashed session
records in the selected application database (SQLite or MySQL): login rotates
a browser session, logout revokes it server-side,
and expired records are purged on subsequent logins. Migration 006 intentionally
invalidates earlier stateless auth cookies (users log in again), without changing
guest progress. See `docs/AUTH_SESSION_HARDENING.md`.
POST/PATCH browser requests require a matching Origin.
Login lockouts and signup quota live in the selected application database.
A bounded per-process IP limit covers Admin/learner login and registration;
account-level lockouts persist in the selected database. Because trustProxy is false, traffic
from a reverse proxy shares the proxy's IP bucket; configure trusted edge IP
rate limiting as well. OAuth, recovery and broader abuse review are pending.

## AI Studio

Use /admin/ai-studio. Set the OpenAI API key, model (default gpt-4.1-mini)
and daily quota in Admin → Settings. Key material remains encrypted server-side;
environment variables are optional fallback for legacy installations.
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
- POST /api/v1/auth/learner/password (reauthenticated password change)
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

MCP Streamable HTTP at POST /mcp uses server-side integration tokens:
- NIHON_MCP_READ_TOKEN: read-only search/get tools.
- NIHON_MCP_TOKEN: search/get plus vocabulary_create_draft (draft only).

Tokens must be different and at least 24 characters; equal values fail closed.
Production MCP requires PUBLIC_ORIGIN, validates Host/Origin and refuses
cross-site browser requests. Requests are bounded per process (120/min/IP/scope)
and responses are not cached. See docs/MCP_SECURITY.md.
OAuth for general remote client access is **not implemented**; do not expose
public remote MCP until independent OAuth/permission review is complete.

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

Read-only v1 SRS inventory (never imports accounts or history):

    npm run db:audit-v1-srs -- --source /secure/legacy/app.db --target ./data/nihon.sqlite

Run after build and only with a verified v1 SQLite source. The audit reports
aggregate unmapped/orphaned/invalid SRS rows and duplicate-mapping conflicts;
it does not print usernames or grant ownership. See
`docs/V1_ACCOUNT_SRS_MIGRATION.md` for the migration gate and identity proof
requirements. Production user accounts, history and review state from v1 have
NOT yet been migrated or safely associated with new learner accounts.

Security notice: the legacy public repository tracks `DockerFile/.env` with
non-empty password settings. The operator must evaluate and rotate any active
credentials; see `docs/SECURITY_CREDENTIAL_EXPOSURE.md`. This Fastify branch
does not change v1 credentials, user data or history.

## Docker: one container

    docker build -t nihon-fastify .
    docker run -d --name nihon -p 127.0.0.1:3000:3000 -v nihon-data:/opt/nihon/data nihon-fastify
    docker logs nihon   # copy the one-time setup code (first run only)

For a fresh install you can omit --env-file entirely; open /setup to set
the external HTTPS Origin using the interface. The initial one-time setup code
is printed to Docker logs. For existing deployments, --env-file remains
optional and PRIVATE; an explicitly set origin or a UI-saved origin is required
for production browser mutations after setup. Image startup checks the local
bootstrap SQLite schema and resumes the chosen SQLite/MySQL engine in one
non-root Fastify process. Mount a persistent private volume for bootstrap
configuration, the SQLite application DB when selected, and
instance-secret.key. Do not recreate the key. See docs/UI_FIRST_INSTALL.md.

## SQLite backup and restore (no overwrite)

After `npm run build`, the backup CLI uses Node's SQLite online backup API,
so it includes committed WAL changes without touching the source database:

    npm run db:backup -- --source ./data/nihon.sqlite --target /secure/backups/nihon-backup.sqlite

Restore **only into a new file** for a verification drill:

    npm run db:restore -- --source /secure/backups/nihon-backup.sqlite --target ./data/nihon-restored.sqlite

Run a fully disposable, end-to-end consistency drill in a protected scratch
directory. It backs up into an isolated 0600 file, restores into another file,
checks integrity, FK constraints, migration SHA-256 checksums and deterministic
schema/row digests, then deletes both copies:

    mkdir -m 700 -p /secure/qa-scratch
    npm run db:drill -- --source ./data/nihon.sqlite --scratch-dir /secure/qa-scratch

No user data or digests appear in the output; only table/row aggregates are
printed. Use a staging snapshot as source when possible. The drill is **not**
a retained backup, not an automatic cutover, and has not been validated with a
real production/v1 SQLite source. See docs/SQLITE_RECOVERY_DRILL.md.

Both commands refuse existing destination paths and require an existing parent
directory. Copies use 0600 permissions and must pass SQLite integrity_check;
failed copies are discarded. Restore never replaces the running DB, updates
DB_PATH, or deploys anything. For cutover, stop the application, verify the
restored copy and counts on an isolated instance, then explicitly choose a
rollback/cutover procedure. Mount a separate protected backup location when
running in Docker; do not keep the only backup inside the live SQLite volume.

## MySQL backup and staging restore (UI-first)

MySQL Admin → Settings includes a **Sao lưu MySQL** panel:
create a consistent, compressed AES-256-GCM encrypted snapshot on a 0600
server file, verify its authenticated contents, download it for protected
offsite storage, or rehearse a full content-checked restore into a separate
**existing, empty** `nihon_restore_...` MySQL database. No live database
overwrite or automatic cutover is possible. The separate staging schema
must be inspected/cleaned up through approved MySQL operations.

Protect `data/instance-secret.key` and the small bootstrap SQLite database
separately from the MySQL backup file. Losing the key makes an encrypted
archive unreadable. A snapshot is limited to 100,000 rows/128 MiB raw and a
staging restore to 25,000 rows/32 MiB; the application will never prune
stored backups automatically. Download/export a retained offsite copy.
See `docs/MYSQL_BACKUP_RESTORE.md` for security, recovery limitations and
staging steps. This does not replace a cloud MySQL PITR or native snapshot
and is not certification of production disaster recovery.

## Verification

    npm run typecheck
    npm test
    npm run lint
    npm run build

The HTTP smoke script only works on localhost and mutates an isolated test DB:

    SMOKE_ENABLE=yes node scripts/smoke-http.mjs

Current limitations: no automated SQLite ↔ MySQL data conversion, no fully
verified production MySQL snapshot/restore and failover runbook,
production login abuse prevention, OAuth for remote MCP, v1 user/progress
migration, approved rollback plan, real AI key E2E and production load test. The v1 Express runtime in the repository is reference
code only; deploy only the Fastify application from this directory.
