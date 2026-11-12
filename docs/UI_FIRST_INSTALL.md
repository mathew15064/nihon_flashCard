# Nihon: MySQL-only UI-first installation

## Prerequisites

Nihon v2 uses **MySQL 8.4 exclusively**. It requires an existing empty
MySQL database and credentials. No environment file, SQLite setup, source
edits, Redis, second Node process or alternate database choice is needed.

Start the app as documented in the app README. Open /setup and use the
one-boot Admin setup code from private server logs. Enter MySQL Host, Port,
Database, Username, Password and TLS policy. Press **Kiểm tra kết nối**,
set an Admin password and website Origin, then finish. Only native
MySQL/Drizzle migrations run. The app does not provision the MySQL server.

The setup code is neither stored nor returned by HTTP. The wizard refuses
cross-site Origin headers. An already initialized MySQL Admin cannot be
replaced through the wizard. If the local connection file was lost, the
operator must supply the existing MySQL Admin password to reconnect;
original instance secrets are still required for encrypted credentials.

## Storage and encryption

All application tables are MySQL: vocabulary/senses/examples, decks,
Admin/learner password verifier, login lockouts, auth sessions, SRS
cards/events, guest merges, AI jobs/candidates and integration settings.

The app volume contains only:
- **instance-secret.key**: authentication/encryption secret (0600).
- **mysql-connection.enc**: AES-256-GCM encrypted connection credentials (0600),
  atomically updated when changed from Admin Settings.
- **mysql-installed.marker**: prevents a damaged installation from being
  silently claimed as fresh.
- **mysql-backups/**: optional encrypted backups, private directory (0700).

**No SQLite database, SQLite driver or SQLite migration runs** even at
Docker startup. The connection configuration is an encrypted file, not a
second database. It survives restart without manual configuration.

A legacy file such as nihon.sqlite or app.db is **never deleted or silently
converted**. Startup fails closed until an operator explicitly handles it.
Migration of an older SQLite deployment to MySQL is not automated.

## Admin Settings

At /admin/settings, configure the website Origin, learner signup, OpenAI
API key/model/quota, scoped MCP read/writer tokens, REST integration token
and MySQL connection health/rotation. Provider secrets are encrypted in
MySQL app_settings. Tokens are shown only once when generated.

A connection change verifies the same target database, existing Admin
verifier and applied migration ledger. Switching database to a new schema
requires a reviewed migration/cutover rather than typing a new name.

## Backups and recovery

Use the backup panel and docs/MYSQL_BACKUP_RESTORE.md to create, download,
verify and stage-restore authenticated encrypted snapshots. The staging
target is an existing, different, completely empty MySQL schema prefixed
nihon_restore_. It never overwrites the active database.

Retain offsite backups of both MySQL **and the private instance key and
encrypted connection file**. Without the key, archives cannot be decrypted.
The UI does not replace MySQL point-in-time recovery, offsite retention or
a reviewed production disaster-recovery runbook.

## Quality gates

CI runs typecheck, lint, production build and tests on a real isolated
MySQL 8.4 service. Tests cover MySQL-only provisioning without .sqlite,
private file permissions, legacy data denial, tampering, Admin and learner,
vocabulary, decks, SRS, AI/MCP, encrypted backup and staging restore.

Legacy v1 Express and the old Next.js worktree remain untouched.
PR #2 stays Draft until production rollout receives explicit approval.
