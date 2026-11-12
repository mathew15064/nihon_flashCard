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
SQLite creation, a fail-closed guard for older database volumes and
OpenAI metadata verification (fixed host, no redirects/prompt, error mapping
and no leaked credentials).

Real MySQL 8.4 integration tests execute only when NIHON_MYSQL_TEST_URL
points at a disposable MySQL instance. Each HTTP test creates distinct
fresh databases, exercises /setup, Admin, vocabulary, learner, decks,
SRS, AI/MCP and encrypted backup/staging restore, then discards them.
The HTTP suite additionally verifies protected Admin integrations diagnostics,
saved-model verification with injected fake OpenAI responses, rate limits,
real MCP Read/Write tool discovery, writer-only tool calls, and full mocked
Responses generation → AI candidate approval → published vocabulary.
There is **no real OpenAI request or billing** in automated tests.
All MySQL integration test runners reject `NIHON_MYSQL_TEST_URL` values
whose database name does not start with `nihon_qa`. Never point any test
at a live or legacy database. The new pagination regression uses a
uniquely named disposable `nihon_page_*` schema and verifies 105 entries,
stable page order, aggregate totals, no duplicate IDs, no draft leakage
into public listings, and Admin access beyond the first 100 results.

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
- Public vocabulary pagination in a real browser (35 QA-only published
  fixtures, load more, exact totals, no duplicate pagination button).
- Mobile layouts at 320, 390 and 768 pixels (no horizontal overflow,
  including long Latin/Japanese vocabulary terms).
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
It creates and drops only its own randomly named `nihon_qa_e2e_*` database,
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

## Topic/lesson batch contract QA (W5; integration pending)

`app/tests/topics-batch-mysql.test.ts` is a new real-MySQL HTTP contract
suite for the W1–4 implementation. It creates only its own random
`nihon_qa_topics_*` database, verifies the server reports MySQL 8.4, installs
through the real setup endpoint and cleans up its server, database and local
configuration. It uses only `NIHON_MYSQL_TEST_URL`, requires a database name
matching `nihon_qa[a-zA-Z0-9_]*`, and never falls back to an application DB.
Use a disposable server/account with CREATE/DROP privileges; do not supply
production credentials. Errors never print the connection URL or DB password.

```sh
cd app
node --import tsx --test tests/topics-batch-mysql.test.ts
# Set NIHON_MYSQL_TEST_URL through your private test environment first.
```

Coverage added (these are assertions, not a claim they have passed):

- 100 new draft items, exact request replay, repeated items within a request,
  a sibling lesson sharing 50 words, and another 100-item batch appended to
  that sibling (200 links total, without replacing its first batch).
- All 100 entries returned in Admin detail, Vietnamese meanings, stable IDs
  across lesson deduplication, and rejection of empty/101-item requests.
- Private topics/lessons hidden from public lists and details; protected
  Admin list/create/batch/publish endpoints return 401 even in NoAuth mode;
  cross-origin Admin publishing returns 403.
- Selected publish and replay, foreign-entry refusal, bulk publishing of the
  remaining entries, then explicit full-lesson publishing and public discovery.
- Enrollment of 100 published entries, review replay and re-enrollment with
  SQL comparison of every card/event field to detect schedule/counter resets.
- Public lesson rejects a new draft without an orphan vocabulary row.
- Anonymous MCP discovery, a 100-word draft batch and replay, private-entry
  read protection, absence of publishing/Admin tools, and failed publish call.
  The batch tool is discovered by `items` and `lessonId` schema fields rather
  than an invented tool name; reconcile this with W3 before sign-off.

The browser runner retains the original installer, vocabulary/deck, settings,
learner and SRS assertions and adds an independent Admin topic/lesson page,
JSON batch submission, exact 100-word rendering, publication, anonymous topic
navigation, 320/390/768px overflow checks and axe scans on the new views.
It requires W4's accessible labels (`Tên chủ đề`, `Tên bài học`, `Chủ đề`,
a JSON field and batch/publish buttons), `/admin/lessons/:id`, and `/topics`.
These UI route/label assumptions must be reconciled with W4's final UI;
missing features fail the run rather than being silently skipped. The new
browser journey must not be reported passed until exercised on the integrated
production build against MySQL 8.4 and Chromium.

At the W5 base, topic/batch routes and UI are absent. Without the QA URL,
the new MySQL suite is **skipped**, not passed. Static type/lint success
does not prove the shared service contract. Pending W1–4 type failures must
be recorded as integration blockers rather than fixed in other workers'
files. Additional open checks include a populated-v2 upgrade, topic-aware
backup/restore, concurrent batch requests, invalid-item partial recovery,
external ChatGPT client behavior and abuse limits. See
[topic/lesson usage and security](TOPIC_LESSON_BATCH.md).

### W5 local verification record (2026-11-12)

- `npm run typecheck`, `npm run lint`, `npm test`, browser script syntax and
  `git diff --check` exited successfully on the worker base.
- Direct execution of `node --import tsx tests/topics-batch-mysql.test.ts`
  reported **one skipped test** because no QA URL was configured. An invented
  non-QA URL was rejected with `TOPICS_BATCH_REQUIRES_DISPOSABLE_QA_MYSQL`
  before any database connection. No real MySQL assertions ran.
- `npm run test:e2e` refused to start without the QA URL; no browser assertions
  or axe scans ran. W1–4 integration and UI selector reconciliation remain open.
- Standard `npm run build` failed because the shared, read-only `node_modules`
  symlink prevents Vite writing `.vite-temp`. Without modifying dependencies,
  `npx vite build --configLoader runner` and the package's esbuild server
  bundle command succeeded. This environment workaround is not a claim that
  the standard build command passed.


## T05: topic-aware backup/restore on disposable MySQL 8.4

A source-code or syntax check is **not** a restore PASS. Only run the new
synthetic QA script on a physically isolated local MySQL 8.4 with a QA-only
CREATE/DROP account; never paste credentials into a ticket or connect to the
VPS/live MySQL. The URL's database component must begin nihon_qa, but the
runner never writes to it: it creates unique fresh nihon_qa_t05_* source
and nihon_restore_t05_* target schemas and cleans up only ones it created.

    cd app
    npm ci
    node --check scripts/topic-restore-qa.mjs
    # Set NIHON_MYSQL_TEST_URL privately through approved local QA env.
    node --import tsx scripts/topic-restore-qa.mjs

Expected: a JSON object with status PASS, per-table row counts and
SHA-256 full-content digests, all required topic/lesson/vocabulary/SRS
tables, the two applied migration checksums, zero FK orphans, archived
ciphertext/plaintext checksums, exact SRS schedule/counters and an
AES-GCM tamper case rejected before staging DDL. The script exits 2 and
prints BLOCKED when the URL is absent, or nonzero on failed assertions.
Capture the command exit code, UTC date, base/worker commit SHA, MySQL
version and **sanitized** output in the release evidence folder. No
personal data, instance keys or connection URLs in logs.

Run the same image and schema pairing that is proposed for release;
record the immutable Docker image digest, migration-file checksum and
whether the recovered app boots/restarts against an isolated restored
schema. An image build passing does not substitute for this run.
Old pre-topic archives need a separate older-image reader and additive
migration rehearsal (see MYSQL_BACKUP_RESTORE.md).

### Nine MCP tools and external ChatGPT client

The actual MCP code advertises **nine tools** to a writer and **five**
to a reader. The exact tool names at this code revision are:

| Tool name | Read token | Write token / explicit NoAuth test | Expected safe behavior |
| --- | --- | --- | --- |
| vocabulary_search | Yes | Yes | Published vocabulary only |
| vocabulary_get | Yes | Yes | No private draft leakage |
| topics_list | Yes | Yes | Public topics for anonymous access |
| lessons_list | Yes | Yes | Optional topicId; hide private lessons from anonymous |
| lesson_get | Yes | Yes | Public lesson only for anonymous |
| topics_create | No | Yes | Create or reuse private topic; never publish |
| lessons_create | No | Yes | Create or reuse private lesson; never publish |
| lesson_add_vocabulary_batch | No | Yes | 1–100 draft items; dedup/replay; no publish |
| vocabulary_create_draft | No | Yes | Single private draft |

With an approved **non-personal QA-only** test connection, use
Streamable HTTP POST /mcp and the server-advertised input schemas:

1. Invoke tools/list separately with Read and Write credentials. Assert
   exact sets (five and nine), schema fields (not guessed names), and
   absence of any publish/Admin tool.
2. Using Write, create/reuse a synthetic topic and lesson, submit 100
   unique test items, retry once and confirm no new links/IDs; submit a
   second batch when required. Verify private read isolation with Read
   and anonymous access, and explicit Admin REST rejection (401). NoAuth
   is test-only and must remain disabled for release.
3. Exercise each of the nine tools at least once with expected success,
   validation rejection and relevant permission failure. Record tool
   list, sanitized results, client version, transport/HTTP status,
   endpoint, time and test commit. No production data or bearer tokens
   should appear in screenshots or client logs.
4. In an actual connected ChatGPT client, confirm all nine tool names
   are discoverable **from live tools/list**, not memory or diagnostics.
   If the client still lists older tools after backend update, token
   rotation or scope change, refresh the connection: disconnect the
   old MCP app/connector, reconnect/reauthorize with the QA endpoint,
   and re-run tools/list in a new chat/session. Tool caching and
   authorization can delay schema refresh; a server passing its own
   tests does not prove external client discovery.
5. Finish with token revocation and a fresh tools/list denied with the
   revoked token; document the restored safe configuration. Require
   human validation of Japanese readings, Vietnamese meanings and
   private/publish behavior.

Mark external ChatGPT MCP as **BLOCKED** without a real client result.
If the current client only exposes the older three-tool Nihon connector
or requires reconnection, do not label the nine-tool acceptance PASS.

### T01–T04 evidence to integrate before T05 release verdict

Gather separate commit SHA, run URL, exact MySQL test target type,
browser recordings/axe artifacts and PASS/FAIL/BLOCKED per worker:
T01 topic migration/legacy identity; T02 lesson/deck/SRS; T03 batch and
MCP scopes, abuse limits and retries; T04 UI, browser and accessibility.
Re-run integrated typecheck, lint, npm tests **without skips**,
Chromium E2E, and CI for the exact combined commit. Check security,
rate limits, CSRF/Origin, secrets, performance/concurrency, human
screen-reader/touch/zoom checks, image recovery and rollback.
A skipped MySQL test, a past successful CI on a different SHA, a
tool-configured state, and a test-only public deployment are **not
release approval**. See RELEASE_READINESS.md for final gates.
