# TESTING — Japanese Flashcard

Two independent test layers. Both must pass before any deploy.

## Quick reference

```bash
npm test           # API tests (Node built-in test runner)
npm run test:api   # same as `npm test`
npm run test:e2e   # Playwright end-to-end tests
npm run test:all   # both, in sequence
```

## Layout

```text
test/
├── helpers/
│   └── server.js         spawn server on a random port with an
│                         isolated SQLite DB in /tmp
├── api/
│   ├── health.test.js
│   ├── users.test.js
│   ├── content.test.js
│   ├── learning.test.js
│   ├── history.test.js
│   ├── statistics.test.js
│   ├── sessions.test.js
│   └── quiz.test.js
└── e2e/
    ├── smoke.spec.js
    ├── learn.spec.js
    ├── review.spec.js
    ├── quiz.spec.js
    └── i18n.spec.js
```

## Test isolation

API tests call `startServer()` from `test/helpers/server.js`, which:

- spawns `server/server.js` as a child process on a random port (3500–3899),
- sets `DB_PATH` to a per-run file under `os.tmpdir()`,
- waits for the "server running" line on stdout,
- kills the child and deletes the DB (plus `-wal`/`-shm`) on stop.

E2E tests use Playwright's `webServer` config, which starts the server with `DB_PATH=/tmp/jf-e2e.db` on port 3999. The DB is wiped before each run.

Because of this, tests NEVER read or write `data/app.db`. That file is only used by the dev/prod server.

## Writing a new API test

```js
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers/server');

let server;
before(async () => { server = await startServer(); });
after(() => server && server.stop());

test('GET /api/health returns ok', async () => {
  const r = await fetch(`${server.baseURL}/api/health`);
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.success, true);
});
```

Use timestamp- or random-based identifiers (usernames, content ids) so tests remain idempotent across runs.

## Writing a new E2E test

```js
'use strict';

const { test, expect } = require('@playwright/test');

test('page loads', async ({ page }) => {
  await page.goto('/pages/dashboard.html');
  await expect(page.locator('h1')).toBeVisible();
});
```

Playwright's `baseURL` points at `http://localhost:3999`. Use `test.skip()` when a test depends on a state that may not exist yet.

## Debugging

- Run a single spec: `npx playwright test test/e2e/learn.spec.js`
- Run with browser visible: `npx playwright test --headed`
- On failure, Playwright writes a trace to `test-results/` (open with `npx playwright show-trace test-results/.../trace.zip`).
- For API tests, `node --test --test-name-pattern="hiragana"` runs only tests whose name matches.

## CI notes

- Node 22 required (`node:sqlite`).
- `npx playwright install chromium` must run before `test:e2e`.
- Both test suites exit non-zero on failure, so they are safe to wire directly into CI.
