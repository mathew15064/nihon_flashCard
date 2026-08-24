# OVERFLOW — Japanese Flashcard

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

- User system (create/select/switch, active/inactive, localStorage `currentUserId`)
- Hiragana / Katakana / Kanji / Vocabulary content with CRUD APIs
- Search, filtering (type/JLPT/lesson/category), pagination
- Flashcard learn page (random practice queue)
- Learning progress per user (`progress.json`, cards keyed by cardId)
- Review scheduling (interval ladder 10m→1d→3d→7d→14d→30d; wrong → +10min)
- Due-based review sessions (`GET /api/learning/:userId/review`)
- Review history (append-only monthly files)
- Dashboard statistics (learned/mastered/due/today/streak/byType/byLesson)
- Management area (tabs for users + 4 content types, search/filters/CRUD)
- Content-in-use delete guard (`CONTENT_IN_USE`)
- Quiz system: multiple-choice quizzes (JP↔meaning, reading questions, mixed),
  in-memory sessions, server-side answer keys, learning integration via
  `learning.service.recordReview`, result screen with breakdown
- Flashcard swipe gestures on learn page (pointer events; right = correct,
  left = wrong; 100px threshold; same `handleAnswer` path as buttons/keyboard)
- UI i18n: lightweight client-side system in `public/js/i18n/`
  (`vi` default, `en`), locale switcher on learn/review pages,
  persisted in localStorage key `locale`
- Vocabulary cards display word → reading → romanization → localized meaning;
  additive fields `romanization` + `meaningVi` on vocabulary items
  (legacy `meaning` string preserved for quiz/search/management)
- Mobile-first Learn page: 100dvh flex layout with card in the lower-middle
  thumb zone, compact header, progress indicator (`n / total`),
  large Correct/Wrong buttons + Reveal below the card, safe-area padding,
  tap-to-reveal hint, swipe-feedback badge opacity scaled to drag distance
- Optional vocabulary images: Wikimedia Commons provider (no API key),
  `GET /api/images/search` for Management only, image metadata validated
  (http/https) and stored in vocabulary JSON; flashcard shows image after
  reveal with skeleton/error fallback and next-card preloading

## 3. Current Data State

```text
data/users.json                          1 user
data/content/hiragana.json               104 items (seeded)
data/content/katakana.json               104 items (seeded)
data/content/kanji.json                  7 items   (seeded, N5)
data/content/vocabulary.json             15 items  (seeded, Minna lessons 1–3;
                                                   + romanization/meaningVi fields;
                                                   4 items with Wikimedia Commons images)
data/backups/vocabulary.pre-i18n-2026-08-23.json  pre-migration backup
data/backups/vocabulary.pre-image-2026-08-23.json  pre-image backup
data/learning/users/user_001/            real learning data (progress + history)
```

DATA SAFETY:

- `user_001` ("Ngyên") is REAL USER DATA. DO NOT DELETE OR RESET.
- Seed scripts (`server/scripts/seed-kana.js`, `seed-content.js`) rewrite canonical
  content files — do not run them against modified content without intent.

## 4. Current Known Issues

None.

## 5. Current Constraints

- Express 5 is the only runtime dependency — no new deps without justification.
- JSON storage only; no database.
- No React/Vue/Next.js; frontend is jQuery + Tailwind (CDN).
- All fs access goes through `server/utils/json-file.js`.
- Shared content and user learning data are strictly separated.
- Never reset or silently delete learning data/history.
- Backend is the source of truth; frontend never computes progress/scheduling.
- Quiz sessions are in-memory only (lost on restart) — by design, do not persist them.
- UI i18n covers application strings only; content translations live in content
  JSON (`meaning` base/EN string + optional `meaningVi`), never mixed.
- Vocabulary `romanization`/`meaningVi` are additive; `meaning` must stay a
  plain string (quiz-generator, search and management depend on it).

## 6. Current Development

```text
CURRENT_TASK:
None

CURRENT_BLOCKER:
None

NEXT_RECOMMENDED_ACTION:
Wait for explicit request. Possible follow-ups: extend i18n to remaining
pages (dashboard/history/management/quiz), add swipe gestures to review page,
backfill romanization for future vocabulary seeds.
```

## 7. Agent Handoff

- Entry point: README.md → ARCHITECTURE.md → this file → relevant source code.
- Historical context (what happened when, why): read only the specific day in `logs/`.
- API reference: API.md. Data shapes: DATA_MODEL.md. Scheduling rules: LEARNING_SYSTEM.md.
- When adding a feature: follow layering route → controller → service → repository,
  reuse existing services, test, update OVERFLOW.md if state changed, append to today's log.
