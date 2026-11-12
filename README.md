# Nihon Vocabulary v2 — MySQL-only

**Bản Fastify + React mới chỉ dùng MySQL 8.4**, không tạo hoặc chạy
SQLite. Cài đặt qua giao diện tại /setup và cấu hình qua Admin → Settings.
Xem [app/README.md](app/README.md) và
[docs/UI_FIRST_INSTALL.md](docs/UI_FIRST_INSTALL.md).

---

> **Phần bên dưới mô tả ứng dụng Express v1 cũ để tham khảo lịch sử.**
> Không áp dụng các hướng dẫn lưu trữ v1 cho Fastify v2.
> Dữ liệu v1 chưa được chuyển tự động sang MySQL.

# 🇯🇵 Japanese Flashcard (legacy v1)

A lightweight Japanese learning / flashcard web app for personal or small-group use.
JSON files are the entire persistence layer — there is intentionally no database.

## Quick start

```bash
npm install
npm start          # http://localhost:3005  (PORT env to override)
npm run dev        # same, with auto-reload on changes
npm test           # API tests (Node built-in runner)
npm run test:e2e   # Playwright end-to-end tests
```

## Features

- Multiple local users (no authentication) with isolated progress
- Hiragana · Katakana · Kanji · Minna no Nihongo vocabulary
- Flashcard practice and due-based review sessions (simple spaced repetition)
- Study Sessions: large lessons are auto-split into chunks of 10 cards
  (configurable constant) for short daily practice; lesson content is
  unchanged, progress stays per card, review is unaffected
- Quiz mode: multiple-choice quizzes (JP↔meaning, reading questions, mixed)
- Learning states: new → learning → review → mastered
- Review history per month, dashboard statistics, streaks
- Management area: full CRUD + search/filters for users and all content
- Flashcard swipe gestures: swipe right = Correct, swipe left = Wrong
  (buttons and keyboard shortcuts still work)
- UI i18n: Vietnamese (default) / English, switchable per page,
  persisted in `localStorage` (`locale`)
- Vocabulary cards show word → reading → romanization → localized meaning
  (vi/en with fallback chain vi → en)
- Optional illustrative images on vocabulary flashcards, sourced from
  Wikimedia Commons (license/source/author metadata preserved); admins search
  and select images in the Management area — no live internet lookups during
  learning
- SQLite persistence via Node 22 built-in `node:sqlite`
  (no runtime dependency; DB auto-created and content imported on
  first boot)
- Test infrastructure: `npm test` for API, `npm run test:e2e` for
  browser-driven smoke and flow tests

## Documentation navigation

Read in this order:

```text
README.md                      ← entry point (stays at root)
    ↓
docs/ARCHITECTURE.md           ← how the system is designed
    ↓
docs/OVERFLOW.md               ← current project state
    ↓
docs/TESTING.md                ← how to run tests
docs/DEVELOPMENT.md            ← local setup, DB, workflows
    ↓
logs/YYYY-MM-DD.md             (only if historical context is needed)
    ↓
source code
```

Reference docs: `docs/API.md`, `docs/DATA_MODEL.md`, `docs/LEARNING_SYSTEM.md`, `docs/CODE_STYLE.md`, `docs/TESTING.md`, `docs/DEVELOPMENT.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/spec/` (original specs).

## AI Agent Startup Protocol

1. Read `README.md`
2. Read `docs/ARCHITECTURE.md`
3. Read `docs/OVERFLOW.md`
4. Inspect source code relevant to the task
5. Make changes
6. Test changes
7. Update `docs/OVERFLOW.md` if the project state changed
8. Create/update the daily log in `logs/YYYY-MM-DD.md`

Do NOT read all historical logs by default — only when investigating a specific issue.

Detailed references: `docs/API.md` (endpoints), `docs/DATA_MODEL.md` (JSON shapes),
`docs/LEARNING_SYSTEM.md` (scheduling rules), `docs/spec/` (original specifications).

## Tech

- Backend: Node.js + Express.js (single dependency)
- Frontend: HTML + Tailwind CSS + jQuery (CDN)
- Storage: SQLite via `node:sqlite` (`data/app.db`, auto-created;
  content imported once from `data/content/*.json`)

## Data backup

The database file is `data/app.db` (plus `-wal` / `-shm`
siblings while the server is running). Run `npm run backup`
to snapshot the current data into `data/backups/`.
