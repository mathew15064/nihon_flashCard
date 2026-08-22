# IMPLEMENTATION_PLAN — Japanese Flashcard

Sequential phases. Each phase is independently implementable and testable. Complete and verify one phase before starting the next. Update OVERFLOW.md after each phase.

## Phase 1 — Project foundation
- `npm init`, install `express` only (no other deps).
- `server/server.js`, `server/app.js`: JSON body parsing, serve `public/`, mount `/api`.
- `server/utils/json-file.js`: read / atomic write / exists / ensureDir / corrupt-file error.
- `server/utils/id-generator.js`, `server/utils/date.js`.
- `data/` skeleton with empty content files.
- Minimal `public/index.html` + Tailwind + jQuery via CDN.
- **Test:** server starts, static page loads, utility read/write round-trip works.

## Phase 2 — User system
- `constants/`, `repositories/user.repository.js`, `services/user.service.js`, routes/controller for users.
- Users API (GET/POST/PUT/DELETE) with validation + unique username.
- `public/index.html`: user selection screen, create-user modal, localStorage `currentUserId` + validation on startup.
- **Test:** create/select/switch user via UI; users.json stays valid.

## Phase 3 — Content system
- Generic `content.repository.js` + `content.service.js` parameterized by content type.
- Routes/controllers for hiragana, katakana, kanji, vocabulary.
- Search, filters (`type`, `jlpt`, `lesson`, `category`), pagination.
- Seed hiragana + katakana data files.
- **Test:** CRUD + query params via curl.

## Phase 4 — Flashcard UI
- `pages/learn.html`, `js/flashcard.js`: card component, flip/show answer, correct/wrong buttons, next/random card, content-type selector.
- `GET /api/:contentType/random`.
- **Test:** full study loop with seeded content.

## Phase 5 — Learning progress
- `progress.repository.js`, `learning.service.js` (+ `review-scheduler.js` ladder).
- `POST /api/learning/:userId/review`, progress endpoints; per-user directories auto-created.
- Wire flashcard buttons to review endpoint.
- **Test:** answers persist per user; switching users shows independent progress.

## Phase 6 — History
- `history.repository.js` / `history.service.js`; monthly append files.
- History API + `pages/history.html` (list by month, filter by type).
- **Test:** events appear in `YYYY-MM.json`.

## Phase 7 — Dashboard
- `statistics.service.js` + statistics route.
- `pages/dashboard.html`: totals, due count, mastered, today's reviews, streak, per-type and per-lesson progress bars.
- **Test:** numbers match raw JSON contents.

## Phase 8 — Management
- `pages/management.html` + `js/management.js`: tabs for users + 4 content types.
- List/search/filter/edit/delete through existing APIs; delete guards when history references content.
- Seed kanji + vocabulary sample data.
- **Test:** CRUD all entities from UI.

## Phase 9 — Review system
- Due-card selection in `GET /api/learning/:userId/review` using `nextReviewAt`.
- `pages/review.html`: daily review session flow.
- **Test:** cards come back at scheduled intervals (manipulate nextReviewAt to simulate).

## Phase 10 — Polish
- Responsive layout pass, loading states, empty states, error toasts from API envelope.
- Export/backup script (zip/copy of `data/`) — only if requested.
- Code cleanup, final OVERFLOW.md update against Definition of Done (doc/overflow.md §48).
