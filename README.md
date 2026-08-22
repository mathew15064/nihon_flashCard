# 🇯🇵 Japanese Flashcard

A lightweight Japanese learning / flashcard web app for personal or small-group use.
JSON files are the entire persistence layer — there is intentionally no database.

## Quick start

```bash
npm install
npm start          # http://localhost:3000  (PORT env to override)
npm run dev        # same, with auto-reload on changes
```

## Features

- Multiple local users (no authentication) with isolated progress
- Hiragana · Katakana · Kanji · Minna no Nihongo vocabulary
- Flashcard practice and due-based review sessions (simple spaced repetition)
- Quiz mode: multiple-choice quizzes (JP↔meaning, reading questions, mixed)
- Learning states: new → learning → review → mastered
- Review history per month, dashboard statistics, streaks
- Management area: full CRUD + search/filters for users and all content

## Documentation navigation

Read in this order:

```text
README.md                ← you are here (entry point)
    ↓
ARCHITECTURE.md          ← how the system is designed
    ↓
OVERFLOW.md              ← current project state
    ↓
logs/YYYY-MM-DD.md       ← only if historical context is needed
    ↓
source code
```

## AI Agent Startup Protocol

1. Read `README.md`
2. Read `ARCHITECTURE.md`
3. Read `OVERFLOW.md`
4. Inspect source code relevant to the task
5. Make changes
6. Test changes
7. Update `OVERFLOW.md` if the project state changed
8. Create/update the daily log in `logs/YYYY-MM-DD.md`

Do NOT read all historical logs by default — only when investigating a specific issue.

Detailed references: `API.md` (endpoints), `DATA_MODEL.md` (JSON shapes),
`LEARNING_SYSTEM.md` (scheduling rules), `doc/` (original specifications).

## Tech

- Backend: Node.js + Express.js (single dependency)
- Frontend: HTML + Tailwind CSS + jQuery (CDN)
- Storage: JSON files under `data/` (never served statically)

## Data backup

Copy the `data/` directory — it contains users, content, and all learning data.
