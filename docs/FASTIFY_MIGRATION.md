# Fastify v2 — MySQL-only architecture

The feature branch replaces the legacy Express v1 application with a
single Node 22+ Fastify process hosting React/Vite, REST and MCP.

**MySQL 8.4 is the only supported persistence engine.** Native Drizzle
MySQL migrations and async mysql2 transactions back every domain service.
The application has no SQLite driver, migrations or bootstrap database.

On first boot the server generates an instance secret, then presents a
one-time /setup wizard for connection details and the initial Admin.
It stores encrypted MySQL connection credentials in a private local file.
All actual records, accounts, sessions, SRS and API keys live in MySQL.

Admin /admin/settings manages provider keys, model/quota, MCP/REST scoped
integration tokens, connection testing/rotation and encrypted MySQL backups
with staging-only restore drills. Production rollout, legacy v1 identity
migration, automated offsite retention and remote MCP OAuth remain separate.

See app/README.md, docs/UI_FIRST_INSTALL.md and
docs/MYSQL_BACKUP_RESTORE.md. The old Next.js exploratory worktree and
tracked legacy v1 files are untouched. Draft PR #2 must not be merged
or deployed automatically.
