# Nihon Vocabulary — MySQL-only (Fastify + React + Vite)

Nihon runs one Fastify/Node process for the React SPA, REST API and MCP.
**MySQL 8.4 is the only application database.** There is no SQLite engine,
schema, connection, migration or local SQLite bootstrap.

## Zero-.env installation

You need Node 22+ and an existing **empty** MySQL 8.4 database that Nihon
can connect to and migrate. MySQL itself is provided by your hosting
environment (or a separate MySQL container).

```sh
cd app
npm ci
npm run dev
```

Open `http://127.0.0.1:3000/setup` and enter the one-time setup code shown
in the server's private logs. Supply MySQL Host, Port, Database, Username,
Password and TLS policy. **Kiểm tra kết nối** checks the connection.
Then set your Admin password and website Origin and finish setup. MySQL
migrations run automatically. You never need to edit source or create .env.

After logging in, **Admin → Settings** controls:
- MySQL connection health and safe credential rotation (same database and
  Admin identity only; no accidental database switch)
- OpenAI API key, model and request quotas (encrypted in MySQL)
- Learner signup
- MCP read-only and draft-writer tokens plus REST Admin token
- MySQL backup/verify/download and staging-only restore drill

An external MySQL server, persistent volume, TLS termination and domain are
still infrastructure responsibilities; source configuration is unnecessary.

## What lives where?

- **MySQL** stores *all* Nihon application data: Admin verifier, learners,
  signed-session digests, login throttles, vocabulary, decks, AI jobs,
  flashcards, SRS events, guest claims, and integrations/settings.
- **Local persistent volume** (default `app/data/`; Docker
  `/opt/nihon/data`) contains only
  `instance-secret.key` (0600),
  `mysql-connection.enc` (AES-256-GCM, 0600),
  `mysql-installed.marker`, and any encrypted MySQL backup files.
  **No SQLite database is created.**

The private instance secret is generated on first boot and is required to
decrypt connection configuration and backups. Back up that key and encrypted
configuration **separately** from the MySQL data. An encrypted MySQL archive
alone is not sufficient for recovery.

Override the persistent volume directory only if needed using
`NIHON_DATA_DIR`; this is an advanced deployment setting, not a requirement.
Optional runtime variables include `HOST`, `PORT` and `AUTH_SECRET`.
An `.env` file is neither generated nor automatically loaded.

## Docker (one app process)

```sh
cd app
docker build -t nihon-mysql .
docker run -d --name nihon \
  -p 127.0.0.1:3000:3000 \
  -v nihon-data:/opt/nihon/data nihon-mysql
docker logs nihon
```

The Docker network must permit this container to reach MySQL. For another
MySQL container, use its container/network DNS hostname rather than
`localhost`. For a remote production server, use TLS with valid certificate
verification; the public-facing app requires HTTPS. Keep the setup code private.

## Features

Japanese vocabulary, decks, Admin content review/publish, flashcards,
scheduled SRS, private guest sessions and learner accounts, guest-progress
claim, current-password change (other sessions revoked), AI vocabulary
generation, and authenticated scoped MCP integration.

The API remains at `/api/v1`, MCP at `/mcp`.
Read/write MCP credentials remain suitable for *trusted integration clients*,
not arbitrary public OAuth connections.

## MySQL backup and safety

Use **Admin → Settings → Sao lưu MySQL** to create a consistent encrypted
backup, verify its checksum/GCM authentication, download it, or rehearse
a full foreign-key-preserving restore into a **different existing empty
`nihon_restore_...` schema**. Active application records are never
overwritten or silently switched. Review
`docs/MYSQL_BACKUP_RESTORE.md` for size limits and staging instructions.
Production PITR and external retention are still separate operational tasks.

**SQLite installations from an older feature-branch build are NOT
automatically migrated.** If the new server finds such a database on its
volume, startup fails closed with
`LEGACY_SQLITE_INSTALLATION_REQUIRES_MANUAL_MIGRATION`. No data is deleted.
A separately reviewed migration with backup and identity mapping is required.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e   # isolated MySQL 8.4 + Chromium and axe-core WCAG scans
npm audit --omit=dev --audit-level=high
```

MySQL integration tests run against an isolated real MySQL 8.4 service,
set by `NIHON_MYSQL_TEST_URL` in CI. Without this test-only connection,
the MySQL integration suites skip; no production database is touched.
A workflow under `.github/workflows/nihon-fastify.yml` provides a fresh
MySQL container and executes those tests on each PR/push.

No live deployment, legacy v1 account import, legacy identity inference,
unattended offsite backup scheduling, public MCP OAuth, or automatic
production database cutover is included. This branch remains a **Draft PR**.
