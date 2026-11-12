# Nihon installation: SQLite or MySQL 8.4 via the browser

## Quick start — zero source or environment-file edits

Start the Fastify process with a private, **persistent** data volume. The
default local development command is `npm ci && npm run dev`; a Docker
deployment can use `docker run -d --restart unless-stopped -p
127.0.0.1:3000:3000 -v nihon-data:/opt/nihon/data nihon-fastify`.
No `.env` is required for initial Admin creation or AI/MCP integration
configuration. Configure DNS, TLS, firewall and persistent volumes at your
hosting provider as normal.

Open `/setup`, take the random one-time setup code from the **private server
logs** and choose one of:

| Engine | Installation behavior | External infrastructure |
| --- | --- | --- |
| SQLite | Automatically creates database, runs SQLite migrations 001–007 | Only persistent local volume |
| MySQL 8.4 | Tests connection, applies native MySQL Drizzle schema, creates Admin in MySQL | Existing, empty MySQL database + reachable MySQL server |

The MySQL setup screen accepts Host, Port (default 3306), Database, Username,
Password and TLS policy; clicking **Kiểm tra kết nối** validates the connection
with the one-time setup code. Installing will not silently fall back to SQLite.
A database that already has unrelated tables is rejected. MySQL is not installed
by Nihon itself; an existing external MySQL server and database must be
available. **From Docker, a separate MySQL container's hostname is its Docker
network name, not `localhost`.** For remote production MySQL, leave TLS set
to `required` (certificate verification enabled); `off` is for controlled
private test networks only.

The wizard validates the request Origin and one-time code before installing.
An existing installation cannot be taken over through the setup endpoint.

## Where data lives

Under the MySQL choice, all runtime application records live in **MySQL**:
Admin verifier, learner accounts and login lockouts, browser auth sessions,
vocabulary, senses, decks, vocabulary generation jobs/candidates, SRS cards,
review events, guest-to-learner merges, and AI/MCP/Admin integration settings.

A **small local bootstrap SQLite file** remains on the private data volume.
It stores the engine selector and AES-256-GCM-encrypted MySQL connection
details, not user vocabulary/accounts/progress. The randomly created
`instance-secret.key` is also on that volume, separate from the MySQL DB.
This private bootstrap is necessary to connect to MySQL on startup without
an environment file, or asking the Admin for their DB password after reboot.

**Back up BOTH** the private bootstrap volume (including the instance key)
and the MySQL database. Losing either may make the installation impossible
to decrypt or restore even if the other database still exists. Backing up
only MySQL is insufficient for a zero-env deployment.

## Admin → Settings

After installing, `/admin/settings` manages website Origin, signup,
OpenAI key/model/daily quota and MCP read/write or REST integration tokens.
Secrets are encrypted before storage; old tokens cannot be read back and
new tokens are displayed only once when created. Explicit revoke prevents
an old environment fallback from reactivating a credential.

On MySQL installations, the additional **Kết nối MySQL** panel shows the
host, port, database name (fixed), user and TLS policy without ever returning
the MySQL password. It can test a proposed connection and update credentials
without editing source. A replacement MySQL target must have the same
database name, an identical Admin verifier, and applied migration ledger;
otherwise it is rejected rather than switching to unrelated or empty data.

Do not change the underlying engine (SQLite → MySQL or MySQL → SQLite)
for an existing installation in Settings. That is a **data migration**, not
a connection edit; it needs an explicit, verified backup, migration mapping,
reconciliation, and approved cutover. UI provisioning does not import or
claim v1 accounts automatically.

## Schema migrations and recovery

MySQL schema and DDL live in `app/src/db/mysql/schema.ts` and
`app/src/db/mysql/migrations/`. They are native Drizzle/MySQL tables and
a separate MySQL migration ledger (checksum + status). The migration runner
holds an advisory lock. Because MySQL DDL commits independently, a crash or
partial failure leaves an `applying` marker, and the installer **fails closed**
until an operator verifies/repairs the schema or restores a good backup.
Do not delete the migration ledger to force a retry.

SQLite's `db:backup`, `db:restore`, and `db:drill` tools only apply to SQLite.
They do **not** back up the MySQL application database. Use protected
MySQL snapshots or a reviewed `mysqldump --single-transaction` +
restoration into a separate staging schema, then verify row counts, foreign
keys, Admin/learner login, vocabulary, guest SRS, MCP, and AI. Always back
up the bootstrap key and configuration securely. Production cutover and
unattended MySQL backup scheduling are not implemented by this application.

## Security boundaries

- No MySQL password, OpenAI key or MCP token is embedded in the React bundle.
- Setup code is only printed in the operator's private process logs.
- Enforce HTTPS for a public site and TLS certificate verification to remote
  MySQL. The browser must not connect directly to MySQL.
- Treat database hosts, ports and credentials as administrative secrets;
  don't share the setup code with unknown users.
- MCP read/write bearer tokens remain suitable only for trusted integrations;
  OAuth for publicly exposed remote MCP is still pending.
- The legacy Express v1 database, original v1 account mapping and old
  Next.js worktree are not touched by this new-install flow.

## Quality gates (current branch)

Native MySQL 8.4 integration tests cover version/charset checks, migration
idempotence, foreign keys, Drizzle transactions and rollback, vocabulary,
deck publishing, learner registration/password change, SRS due queue and
idempotent reviews, guest-to-learner transfer, AI candidate generation with a
fake provider and encrypted credential storage.

Separate HTTP integration tests exercise the real setup wizard API, native
MySQL installation, Admin login, vocabulary/decks, SRS, learner, Settings,
token rotation, MCP HTTP, and restart restoration. GitHub Actions provisions
an isolated MySQL 8.4 service for these tests alongside the SQLite suite.

This is **not** certification against a real production MySQL server, actual
v1 data, or cloud TLS/network topologies; those need reviewed staging tests.
