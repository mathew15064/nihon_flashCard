# MySQL-only testing (Nihon Fastify v2)

Run from app/:

    npm ci
    npm run typecheck
    npm run lint
    npm test
    npm run build
    npm audit --omit=dev --audit-level=high

The unit tests cover schemas, password hashing, scheduling, provider
request validation, security controls, encrypted connection files, no
SQLite creation, and a fail-closed guard for older database volumes.

Real MySQL 8.4 integration tests execute only when NIHON_MYSQL_TEST_URL
points at a disposable MySQL instance. Each HTTP test creates distinct
fresh databases, exercises /setup, Admin, vocabulary, learner, decks,
SRS, AI/MCP and encrypted backup/staging restore, then discards them.
No production database can be used in those tests.

GitHub Actions provisions an isolated MySQL 8.4 service, supplies the
test-only URL and runs the full suite. All app data must remain MySQL.
The app volume contains only a secret key and encrypted connection file.
See docs/UI_FIRST_INSTALL.md for installation details.
