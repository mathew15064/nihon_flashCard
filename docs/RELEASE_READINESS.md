# Nihon v2 product completion gates — production intentionally deferred

**Decision from project owner:** Complete and verify the application first.
Do **not** deploy production, merge Draft PR #2 into `main`, transfer
live v1 learner records, or configure a public production endpoint as
part of the current development work.

This checklist separates what automated tests prove from the remaining
acceptance criteria. An unchecked item is **not** a claim that the
product is ready.


## T05 disaster recovery decision — HOLD (2026-11-12)

**Release decision: NOT READY / BLOCKED.** Existing checked baseline
items below describe tests at their cited historical commits; they do
not cover this T05 change or establish production DR readiness. The
separate T05 branch begins from e26127da426838a211e3add5638b65b8cc2b907a.
No merge, production deployment, live-MySQL operation or VPS change is
authorized. Maintain PR #2 in Draft until explicit owner approval.

**Verified at the original base SHA only:** GitHub Actions checks for
e26127da426838a211e3add5638b65b8cc2b907a were completed SUCCESS
(runs 43199461747 and 43199453435, on 2026-11-12). Those runs predate
the T05 branch and **do not** validate the new backup manifest guard or
topic-restore-qa script. Record the integrated commit's own CI job links
before considering any release.

**Implemented, not yet executed on real MySQL QA:** topic/SRS-aware
backup manifest/ledger validation, fully synthetic restore QA script,
content digests/counts/FK probes, tamper check, manual recovery runbook,
offsite/retention/RPO/RTO proposal and 9-tool MCP checklist. The
absence of a disposable MySQL 8.4 test service means there is **no
T05 restore PASS** and **no recovered app-image PASS**.


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
- [x] Vocabulary pagination beyond 100 entries: stable ordering,
      no duplicate IDs/draft exposure, batched meanings, Admin load-more;
      Chromium mobile/keyboard/axe regression

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
- [x] Owner-authorized **test-only** HTTPS deployment at
      `broke.locallhost.shop`; Nginx and Fastify health smoke verified,
      old v1 rollback port preserved
- [ ] Operational monitoring/alerting, certificate renewal verification,
      staging recovery drills and full regression sign-off
      (staging is **not production**)
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

## Topic/lesson/batch addition — W5 acceptance pending

The checks above describe the existing v2 baseline. They do not certify the
new W1–4 topic/lesson/batch implementation. W5 adds contract tests and docs
against base `565e42e74faf8392f534dcb5af7e1305ce816d21`; none of the items
below may be checked solely because static checks pass or MySQL tests skip.

- [ ] Integrate W1–4 and resolve shared contract/type mismatches; preserve
      existing MySQL, SRS and v1 records without changing their identities.
- [ ] Run `tests/topics-batch-mysql.test.ts` on disposable real MySQL 8.4:
      100-word lessons, second batch, dedup/replay, private content, Admin-only
      partial/bulk/full-deck publishing and public lesson draft rejection.
- [ ] Verify anonymous MCP batch creates drafts only, cannot publish, read
      private content or access Admin REST; test external ChatGPT discovery
      and topic/lesson get-or-create against the actual advertised schemas.
- [ ] Reconcile W5 browser routes/labels with W4; run the complete preserved
      E2E journey plus topic create, lesson create, JSON batch, all 100 words,
      anonymous public discovery, responsive overflow and axe checks.
- [ ] Confirm 100-card enrollment/re-enrollment and review replay preserve
      every existing card schedule, counter, identity and review event.
- [ ] Rehearse populated-v2 upgrade and migration repeatability, including
      legacy decks without topics; verify topic-aware backup manifests and
      content-checked restore, and recovery of a pre-topic snapshot.
- [ ] Exercise concurrent imports, invalid-item errors/correction, shared
      vocabulary publishing effects and public NoAuth abuse/resource limits.
- [ ] Obtain human desktop/mobile acceptance and an explicit release decision.

See [topic/lesson/batch operator guide](TOPIC_LESSON_BATCH.md) and
[QA instructions and limitations](TESTING.md). This work authorizes only a
local worker commit; it does not authorize push, deploy, main merge, v1
migration, live database writes or rollback/cutover actions.


## T05 final integration evidence matrix (all unchecked until reviewed)

Use exactly PASS, FAIL or BLOCKED per row; a skipped test is BLOCKED.
Attach commit SHA, date/time, operator, sanitized test output and a
stable evidence link for every PASS. A historical CI result cannot
be promoted to the combined HEAD without re-running it.

| Gate | Evidence required | T05 status |
| --- | --- | --- |
| T01 topic schema and populated v2 upgrade | additive two-migration ledger; no changed legacy IDs/FKs | BLOCKED: worker evidence not supplied |
| T02 lessons/deck items and SRS | exact 100-card schedules, replay IDs and counters before/after | BLOCKED: worker evidence not supplied |
| T03 100-word batch, concurrency and MCP | idempotence, second batch, draft privacy, NoAuth abuse and 9 tool schemas | BLOCKED: worker evidence not supplied |
| T04 UI and human accessibility | integrated Chromium routes, mobile axe results and human NVDA/VoiceOver/zoom | BLOCKED: worker evidence not supplied |
| T05 synthetic content-checked restore | local isolated MySQL 8.4, full-table digest, row counts, FKs, migration ledger, tamper | BLOCKED: runner not executed on MySQL QA |
| Historical pre-topic snapshot recovery | old immutable image/key, isolated old-format restore, additive migration | BLOCKED: no rehearsal |
| App image compatibility | pinned digest, restore, private boot, restart, login and SRS smoke | BLOCKED: no recovered-image run |
| CI integrated exact SHA | typecheck, lint, non-skipped MySQL/unit and Chromium axe E2E/build | BLOCKED: T05 branch not checked in CI |
| Security | CSRF/Origin, sessions, Admin/MCP token scopes, NoAuth off, TLS, dependency and secrets review | BLOCKED: current-review evidence missing |
| Performance | concurrent imports, SRS, large pages, backup under load; measured thresholds approved | BLOCKED: measurements missing |
| Accessibility | manual screen-reader/keyboard, reflow 200–400% and touch-target acceptance | BLOCKED: human checks missing |
| Offsite + key custody | copied ciphertext hash, separate recoverable key, retention and restore from offsite | BLOCKED: not approved/configured |
| RPO/RTO and rollback | timed full-loss drill, accepted RPO/RTO, documented DNS switchback | BLOCKED: not demonstrated |
| External ChatGPT MCP | actual 9-tool writer discovery; 5-tool Read; scopes, token revocation and refreshed client | BLOCKED: no client evidence |
| Owner go/no-go | security, legal, QA, ops sign-offs and explicit production instruction | BLOCKED: no authorization |

### Exit checklist for release owner

- [ ] Receive and review **T01–T04** actual commits, checks, fixtures,
      scope and known failures; reconcile onto a *single* integration
      SHA without overwriting another worker's files.
- [ ] Run T05 runner from that exact SHA against *only* an isolated,
      disposable local QA MySQL 8.4; save sanitized full-table digest,
      count, FK, migration and tamper evidence. Distinguish failures from
      missing test resources.
- [ ] Test old-image/pre-topic snapshot migration and recovered-image
      restart against a separate environment. Verify image digest and
      full data identity, not just archive decryption.
- [ ] Confirm GitHub Actions for **integrated HEAD**: checks completed,
      successful, no unreviewed skips, branch protection/reviews
      respected and dependency audit within approved thresholds.
- [ ] Review session cookies, CSRF, Origin, MCP tool scopes, Admin-only
      publishing, NoAuth exposure, SQL permissions, key vault/offsite
      policy and backup tamper/retention controls.
- [ ] Execute representative load/soak/concurrency and backup latency
      tests; obtain security and human accessibility approvals.
- [ ] Prove separate key recovery, a selected offsite restore, monthly
      drill ownership and accepted RPO/RTO. Record actual elapsed timings
      and the exact achievable restore point.
- [ ] Run protected rollback/cutover on a disposable staging copy with
      owner-observed go/no-go and tested manual fallback. No automatic
      rollback or live schema downgrade.
- [ ] Obtain explicit owner release authorization **after** all gates
      pass; only then arrange a separate deployment request. Never use
      the test deployment or green historical CI as authorization.

Related procedures: MYSQL_BACKUP_RESTORE.md, TESTING.md,
TOPIC_LESSON_BATCH.md and ACCESSIBILITY_QA.md. The target RPO of 1h
(with tested PITR) and RTO of 4h are **proposals**, not achieved SLAs.
