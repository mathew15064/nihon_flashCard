# DEVELOPMENT — Japanese Flashcard

Local setup, database, and day-to-day workflows.

## Requirements

- Node.js 22 or newer (`node:sqlite` is used directly).
- Linux / macOS / WSL. Windows native is untested.
- No build step. No bundler. No transpiler.

## First-time setup

```bash
git clone <repo-url>
cd nihon_flashCard
npm install
npx playwright install chromium   # only if you plan to run E2E tests
```

## Running

```bash
npm start    # http://localhost:3005  (override with PORT env)
npm run dev  # same, with auto-reload on file changes
```

## Database

Storage is a single SQLite file: `data/app.db` (plus `-wal` and `-shm` while the server is running). It is created automatically on first boot. Content is imported once from `data/content/*.json` when the `content` table is empty.

### Inspect

```bash
node -e "const {getDb}=require('./server/db/connection');\
const db=getDb();\
console.log(db.prepare('SELECT COUNT(*) AS n FROM content').get());\
console.log(db.prepare('SELECT COUNT(*) AS n FROM users').get());"
```

### Reset (dev only — destroys all users and progress)

```bash
rm -f data/app.db data/app.db-wal data/app.db-shm
# next `npm start` recreates the schema and re-imports content
```

### Backup

```bash
npm run backup    # writes data/backups/full-<timestamp>/
```

The backup script copies `data/users.json` and `data/content/` and `data/learning/` if present (legacy JSON layout). For the SQLite DB, copy `data/app.db` directly when the server is stopped.

## Npm scripts cheat sheet

| Script | Purpose |
|---|---|
| `npm start` | Run the server (port 3005) |
| `npm run dev` | Same, with auto-reload |
| `npm test` | API tests (Node built-in runner) |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:all` | Both test suites |
| `npm run backup` | Snapshot data into `data/backups/` |

## Common workflows

- **Add a new content item** — easiest through the Management page (`/pages/management.html`); it uses the same REST API that scripts would use.
- **Seed a fresh dev environment** — delete `data/app.db*` and start the server. Content comes from `data/content/*.json` on first boot. To regenerate the JSON seeds from scratch, run `node server/scripts/seed-kana.js` and `node server/scripts/seed-content.js`, then delete the DB.
- **Debug a request** — the server logs errors to stdout. For structured traces, the `sendServiceError` helper in `server/utils/error-handler.js` logs `err` before falling back to `INTERNAL_ERROR`.
- **Run just one test file**:

```bash
node --test test/api/content.test.js
npx playwright test test/e2e/learn.spec.js
```

## Architecture map

| Layer | Location |
|---|---|
| HTTP routes | `server/routes/` |
| Controllers | `server/controllers/` |
| Business rules | `server/services/` |
| Persistence | `server/repositories/` |
| SQLite glue | `server/db/` |
| Utilities | `server/utils/` |
| Frontend HTML | `public/pages/` |
| Frontend JS | `public/js/` |
| i18n | `public/js/i18n/` |

## Docker

A `DockerFile/` directory and `docker-compose.yml` exist at the repo root. `./deploy.sh` pulls the latest code and restarts the container. The DB lives under the bind-mounted `data/` directory, so it survives container recreation.

## Troubleshooting

- **`ExperimentalWarning: SQLite is an experimental feature` on boot** — harmless, emitted by Node itself.
- **Port already in use** — check with `lsof -i :3005` (or `netstat -tlnp | grep 3005`); kill the stale node process.
- **Playwright browser missing** — run `npx playwright install chromium` once.
- **Content missing after reset** — verify `data/content/*.json` still exist; they are the import source.
