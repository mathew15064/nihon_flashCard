# OVERFLOW — Japanese Flashcard

> **Lưu trữ lịch sử v1:** Tài liệu này mô tả ứng dụng Express cũ, không phải Fastify v2. Nihon v2 chỉ dùng MySQL 8.4; xem [hướng dẫn cài đặt mới](UI_FIRST_INSTALL.md) và [app/README.md](../app/README.md).

CURRENT PROJECT STATE. Historical details live in `logs/YYYY-MM-DD.md`.

## 1. Project State

```text
STATUS:              STABLE
CURRENT_PHASE:       10 (+ Quiz feature complete)
PHASES_COMPLETED:    10/10
CURRENT_TASK:        NONE
CURRENT_BLOCKER:     NONE
```

## 2. Current Implementation

- **Backend storage**: SQLite via `node:sqlite` (built-in, Node 22).
- **DB file**: `data/app.db` (gitignored). Auto-created on boot via
  `server/db/init.js`; content auto-imported on first run from
  `data/content/*.json`.
- **Repository layer**: rewritten to SQL; every repository method
  (`insert`, `updateFields`, `remove`, `upsertCard`, `appendEvent`)
  is SQL-backed.
- **History table**: no more monthly history JSON files; history is a flat table with
  time indexes.
- **Legacy storage**: `data/users.json` and `data/learning/` are no longer read or written.
- **Docs layout**: project documentation lives under `docs/`; original
  pre-implementation specs archived under `docs/spec/`. Root keeps only
  `README.md` as entry point and `logs/` for daily history.
- **Error handling**: single shared `server/utils/error-handler.js`
  (`sendServiceError`); every service/repository throws structured
  `{code, status, message}` errors dispatched by code+status, never by
  string matching on `err.message`.
- **Layering**: every route delegates to a thin controller; controllers
  import the shared error handler and contain zero business logic.
- **fs access**: `server/db/connection.js` and `server/utils/json-file.js`
  handle filesystem operations; `app.js` imports `path` for static-file serving.

## 3. Current Data State

```text
data/app.db          SQLite (users, content, progress, history)
data/content/*.json  legacy import source (read-only)
data/users.json      legacy, no longer used
data/learning/       legacy, no longer used
data/backups/        manual snapshots
```

DATA SAFETY:

- Real learning data must now be preserved via DB backup, not by copying JSON.
- `user_001` ("Ngyên") is REAL USER DATA. DO NOT DELETE OR RESET.
- Seed scripts (`server/scripts/seed-kana.js`, `seed-content.js`) rewrite canonical
  content files — do not run them against modified content without intent.

## 4. Current Known Issues

None.

## 5. Current Constraints

- Express 5 is the only runtime dependency — no new deps without justification.
- SQLite storage via built-in `node:sqlite` (Node 22); `data/app.db` is the single source of truth.
- No React/Vue/Next.js; frontend is jQuery + Tailwind (CDN).
- Shared content and user learning data are strictly separated.
- Never reset or silently delete learning data/history.
- Backend is the source of truth; frontend never computes progress/scheduling.
- Quiz sessions are in-memory only (lost on restart) — by design, do not persist them.
- UI i18n covers application strings only; content translations live in content
  JSON / SQLite `data` column (`meaning` base/EN string + optional `meaningVi`), never mixed.
- Vocabulary `romanization`/`meaningVi` are additive; `meaning` must stay a
  plain string (quiz-generator, search and management depend on it).

## 6. Current Development

```text
CURRENT_TASK:
None

CURRENT_BLOCKER:
None

NEXT_RECOMMENDED_ACTION:
None. All features in scope are implemented and tested.
Possible follow-ups: SQLite backup/restore CLI, additional
image providers, SM-2 spaced repetition, dashboard caching.
```

## 7. Agent Handoff

- Entry point: README.md → ARCHITECTURE.md → this file → relevant source code.
- Historical context (what happened when, why): read only the specific day in `logs/`.
- API reference: API.md. Data shapes: DATA_MODEL.md. Scheduling rules: LEARNING_SYSTEM.md.
- Tests: docs/TESTING.md. Dev workflow: docs/DEVELOPMENT.md.
- Run npm test and npm run test:e2e after any backend change; both must pass.
- When adding a feature: follow layering route → controller → service → repository,
  reuse existing services, test, update OVERFLOW.md if state changed, append to today's log.
