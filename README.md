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
- Learning states: new → learning → review → mastered
- Review history per month, dashboard statistics, streaks
- Management area: full CRUD + search/filters for users and all content

## Documentation

Read in this order before changing anything:

```text
doc/readme.md            ← project rules & AI agent protocol
doc/architecture.md      ← full architecture specification
doc/overflow.md          ← context & decision log (spec side)
ARCHITECTURE.md          ← decided architecture
DATA_MODEL.md            ← JSON data models
API.md                   ← REST endpoints
LEARNING_SYSTEM.md       ← states & review scheduling
IMPLEMENTATION_PLAN.md   ← phased build plan
OVERFLOW.md              ← living project state (implementation side)
```

## Tech

- Backend: Node.js + Express.js (single dependency)
- Frontend: HTML + Tailwind CSS + jQuery (CDN)
- Storage: JSON files under `data/` (never served statically)

## Data backup

Copy the `data/` directory — it contains users, content, and all learning data.
