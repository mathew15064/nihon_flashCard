# Nihon v2 product completion gates — production intentionally deferred

**Decision from project owner:** Complete and verify the application first.
Do **not** deploy production, merge Draft PR #2 into `main`, transfer
live v1 learner records, or configure a public production endpoint as
part of the current development work.

This checklist separates what automated tests prove from the remaining
acceptance criteria. An unchecked item is **not** a claim that the
product is ready.

## Core product and integrity (automated)

- [x] One-process Fastify + React/Vite app with MySQL-only Drizzle ORM
- [x] UI-first fresh MySQL installer; private encrypted connection config
- [x] Admin/learner auth, revocable sessions, signup, guest learner claim
- [x] Vocabulary/decks CRUD and private-to-public review/publish flows
- [x] Flashcard and SRS due queue, idempotent review transactions
- [x] AI Studio with provider adapter, draft-review-publish workflow
- [x] MCP Read/Write scoped protocol endpoint and revocable tokens
- [x] Admin Settings including MySQL, OpenAI and MCP configuration
- [x] Encrypted MySQL backup and staging-only content-verified restore drill
- [x] Real MySQL 8.4 integration/unit tests with key-security checks
- [x] Full-browser Chromium journey, responsive viewport and automated
      accessibility scans
- [x] Browser navigation and flashcard keyboard accessibility checks
- [x] OpenAI model-metadata verification with sanitized errors and rate
      limit; safe *mocked* AI generation integration test
- [x] Real MCP HTTP `tools/list` and `tools/call` scope tests

## Still open before approving a public release

- [ ] Real authorized OpenAI account/project/model connectivity and
      Responses API generation verified with user-provided test budget
- [ ] At least one external trusted MCP client can connect, enumerate
      tools and respect Read/Write scopes; public OAuth remains unsupported
- [ ] Human acceptance of every Admin/learner flow on desktop and mobile,
      including Vietnamese/Japanese content quality and error states
- [ ] Human assistive-technology checks with NVDA or VoiceOver,
      zoom/reflow and touch-size testing
- [ ] Performance and concurrency/load characterization for guest SRS,
      AI quotas, large vocabulary pages and backup under load
- [ ] Security review of session/cookie/CSRF, Admin tokens, rate limits,
      TLS/connectivity assumptions and threat model on the target platform
- [ ] Independent offsite MySQL + key/config backup recovery exercise,
      retention policy, monitoring, restore time objective and approved
      disaster-recovery runbook
- [ ] Real staging with HTTPS/TLS/domain, monitoring and smoke tests
      (staging is **not production**; only when explicitly approved)
- [ ] Verified legacy v1 snapshot, identity ownership mapping and
      non-destructive import plan **if old learner data needs cutover**
- [ ] Release acceptance from owner, tested rollback, final QA
      sign-off and an explicit separate production deployment request

## Operational principles

- The application uses **only MySQL 8.4** for application data.
- A private on-disk `instance-secret.key` and encrypted
  `mysql-connection.enc` are required to reconnect on reboot.
  They are **not** a SQLite database. Preserve them during recovery.
- Automated tests use disposable MySQL QA schemas and mock external
  OpenAI HTTP; a passing CI run does not certify third-party accounts,
  production-network TLS, disaster recovery or all accessibility needs.
- No code change automatically authorizes `main` merge, live-domain
  cutover or data import.
- Keep the feature branch and PR in Draft until all completion gates
  are met. Only begin production implementation on a later explicit
  owner request.

Related: `docs/TESTING.md`, `docs/ACCESSIBILITY_QA.md`,
`docs/INTEGRATION_DIAGNOSTICS.md`, `docs/MYSQL_BACKUP_RESTORE.md`,
`docs/UI_FIRST_INSTALL.md`.
