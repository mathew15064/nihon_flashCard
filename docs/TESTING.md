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

## Browser E2E: complete product journey

The `npm run test:e2e` command runs a **real Chromium browser** against a
fresh production-mode Fastify + React build with an isolated MySQL database.
It verifies the entire UI journey:

- MySQL-only /setup, test connection, first Admin creation and redirect.
- Admin login, draft/publish Japanese vocabulary, create/publish a deck.
- Admin Settings saves an encrypted fake AI key; AI Studio reports it
  configured; MCP token is issued once and not disclosed after reload.
- Public vocabulary search/deck navigation, enroll guest, flip flashcard,
  submit correct SRS review.
- Learner registration/login, claim guest progress, change password.
- Mobile layouts at 320, 390 and 768 pixels (no horizontal overflow).
- **axe-core automated WCAG A/AA rule scans** across the install, Admin,
  AI Studio, vocabulary/decks, flashcards, registration, security and mobile
  views; violations fail the E2E run.
- Keyboard-only skip-to-main navigation, route focus/title management
  and Space-to-flip flashcard semantics.
- API outage feedback and successful retry, and absence of browser JS errors.

To run locally, create a **throwaway MySQL server** and then:

    npm ci
    npx playwright install --with-deps chromium
    npm run build
    NIHON_MYSQL_TEST_URL='mysql://USER:TEST_PASSWORD@127.0.0.1:3306/nihon_qa' npm run test:e2e

The browser runner **refuses** a non-`nihon_qa*` source database name.
It creates and drops only its own randomly named `nihon_e2e_*` database,
uses a temporary local secret/config directory, a free localhost TCP port
and an ephemeral fake provider key. It does not contact the actual OpenAI
API, production MySQL, or legacy user databases. Never pass production
credentials to E2E tests. Use `NIHON_CHROMIUM_PATH` to select an already
installed browser binary if needed.

GitHub Actions provisions an isolated MySQL 8.4 service, installs Chromium
and runs `npm test` **plus** `npm run test:e2e` after building production
assets. All app domain data must remain in MySQL. The app volume contains
only the private secret and encrypted connection file.

This E2E suite covers the central journey and regression bugs it found;
it does **not** yet certify real API-provider billing, accessibility audits,
stress/performance, recovery under node failure or a public deployment.
