# OVERFLOW — Japanese Flashcard

Living project state document. Update after every change (see doc/readme.md §3 Step 9).

## 1. Current State

```text
Phase 10 — Polish: COMPLETE
All 10 phases done — Definition of Done (doc/overflow.md §48) satisfied.
No pending phases. Future work only on explicit request (see doc/architecture.md §33).
```

## 2. Implementation Progress

| Phase | Status |
|---|---|
| 1. Foundation | ✅ Done |
| 2. User system | ✅ Done |
| 3. Content system | ✅ Done |
| 4. Flashcard UI | ✅ Done |
| 5. Learning progress | ✅ Done |
| 6. History | ✅ Done |
| 7. Dashboard | ✅ Done |
| 8. Management | ✅ Done |
| 9. Review system | ✅ Done |
| 10. Polish | ✅ Done |

## 3. What Exists

- `package.json` — `npm start` / `npm dev` (--watch), single dependency: express@5.
- `server/server.js`, `server/app.js` (`createApp()`): JSON body parsing, `/api/health`,
  static serving of `public/`, API 404 fallback, central error handler,
  response helpers injected as `res.locals.sendSuccess/sendError`.
- `server/utils/json-file.js` — all fs access; path-traversal guard, atomic write
  (tmp + rename), per-file serialized write queue, corrupt JSON → clear error.
- `server/utils/id-generator.js` — `{type}_NNN` ID generation (user_, kanji_, …).
- `server/utils/date.js` — ISO now, month key, addMinutes/addDays, same-day check.
- `data/users.json` + `data/content/{hiragana,katakana,kanji,vocabulary}.json` (all empty arrays).
- `public/index.html` user selection screen (list active users, create-user form,
  select → dashboard, inactive users not selectable);
  `public/js/current-user.js` localStorage helper (`currentUserId` + API validation);
  `public/pages/dashboard.html` placeholder gated by user validation with switch-user;
  `public/js/api.js` request abstraction with success/error envelope unwrapping.
- Content system: generic `repositories/content.repository.js` (file map per type),
  `services/content.service.js` (per-type validation, search, filters
  type/jlpt/lesson/category, pagination page/limit max 500), factory-based
  `routes/content.routes.js` + `controllers/content.controller.js` mounted at
  `/api/{hiragana,katakana,kanji,vocabulary}`. List responses include
  `meta {total, page, limit}`. IDs `{type}_NNN`, never reused.
- Flashcard UI: `GET /api/:contentType/random?count=` (1..100 clamp) in content
  service/routes; `public/pages/learn.html` + `public/js/flashcard.js` —
  content-type selector, card queue of 10 random cards, reveal (click/Space),
  Correct/Wrong buttons enabled after reveal (answer recording wired in Phase 5),
  keyboard shortcuts, empty state, per-type front/back rendering
  (kana/kanji/vocabulary). Dashboard links to Learn; Review tile placeholder.
- Polish: mobile card sizing (text-5xl base), review session counter fix,
  flashcard empty-state cleanup, dashboard loading/error state for statistics,
  root README.md with quick start. Final sweep: all data JSON valid, all 9 API
  groups + 6 pages return OK, user learning data persists across restarts.
- Review system: `GET /api/learning/:userId/review?contentType=&count=` returns
  due cards (nextReviewAt <= now, ordered by due date) first, then random NEW
  untracked cards to fill; each item includes joined `content` for rendering.
  `public/pages/review.html` + `public/js/review.js`: session flow with
  reveal/correct/wrong posting reviews, per-card status feedback, end-of-session
  panel + reload. Dashboard Review tile enabled.
- Management: `public/pages/management.html` + `public/js/management.js` — tabs
  for Users/Hiragana/Katakana/Kanji/Vocabulary; debounced search, per-type filter
  dropdowns (type/jlpt/lesson/category), add/edit modal forms, delete with
  confirm; user activate/deactivate buttons; user delete offers force after
  USER_HAS_LEARNING_DATA. Dashboard Manage tile enabled.
- Content DELETE guard: `CONTENT_IN_USE` 409 when any user's progress or history
  references the card (`content.service.findReferences`); unreferenced cards
  delete normally.
- Seed data: `server/scripts/seed-content.js` → 7 N5 kanji + 15 Minna no Nihongo
  vocabulary items (lessons 1–3). Re-running rewrites canonical files.
- Statistics/dashboard: `services/statistics.service.js` +
  `routes/statistics.routes.js` → `GET /api/statistics/:userId`
  (learned/mastered/reviewDue/todayReviews/todayCorrectRate/streakDays,
  byContentType with status breakdown, vocabulary byLesson). Streak = consecutive
  UTC days with ≥1 review, derived from history files. `dashboard.html` rewritten
  with `js/dashboard.js`: stat tiles, per-type progress bars, per-lesson bars,
  nav tiles (Learn/History active; Review/Manage placeholders until Phases 8–9).
- History: `services/history.service.js` + `routes/history.routes.js` mounted at
  `/api/history/:userId` (GET with `?month=YYYY-MM` or `all=true`, filters
  `contentType`/`result`, pagination; GET `/months` lists available month files).
  `public/pages/history.html` + `public/js/history.js`: month selector (populated
  from /months), correct/wrong badges, pager; dashboard History tile added.
  `api.js` now exposes `api.lastMeta` for paginated responses.
- Learning progress: `utils/review-scheduler.js` (interval ladder
  10m/1d/3d/7d/14d/30d; wrong → +10min, streak reset), `repositories/progress.repository.js`
  (per-user `progress.json`, cards keyed by cardId), `repositories/history.repository.js`
  (append-only monthly files), `services/learning.service.js`,
  `routes/learning.routes.js` mounted at `/api/learning/:userId`
  (GET summary, GET progress, GET today, POST review).
- API deviation from API.md: review accepts `contentId` as integer OR full stable id
  (`hiragana_001`); content items only carry the string id, numeric ids are padded to match.
- Flashcard UI wired: Correct/Wrong POST reviews, status line shows state/streak/next.
- Seeded data: `server/scripts/seed-kana.js` → 104 hiragana + 104 katakana
  (basic/dakuten/handakuten/combination). kanji.json / vocabulary.json still empty.
- User system: `constants/` (content-types, learning-status, review-result),
  `repositories/user.repository.js`, `services/user.service.js`,
  `routes/users.routes.js`, `controllers/users.controller.js`.
  Full CRUD at `/api/users`; unique case-insensitive username; `status`
  active/inactive; GET /:id updates lastActiveAt; DELETE blocked while learning
  data exists unless `?force=true`.

## 4. Verified (2026-08-22)

- Phase 1: server start, `/api/health`, static index, API 404 envelope,
  json-file round-trip/traversal block/atomic write, ID/date utils.
- Phase 2: create user (user_001), duplicate username rejected (case-insensitive),
  empty username validation, get+lastActiveAt touch, update displayName/status,
  status filter, force delete, USER_NOT_FOUND after delete.
- Phase 3: hiragana list + meta, katakana search, type filter + pagination,
  kanji/vocabulary create with field parsing and enum validation (jlpt, lesson),
  partial update, search across word/reading/meaning, jlpt filter, delete +
  CONTENT_NOT_FOUND. Test data cleaned (kanji/vocabulary reset to []).
- Phase 4: random endpoint returns unique shuffled cards, count clamped,
  empty types return [], learn.html served.
- Phase 5: review lifecycle (correct→learning→review, wrong→reset+10min),
  invalid type/id/user rejected, summary/progress/today endpoints correct,
  history events appended to `learning/users/{id}/history/2026-08.json`.
- Phase 6: history list + meta, result/contentType filters, invalid filter
  rejection, months endpoint, page served. Test user cleaned up.
- Phase 7: statistics totals/streak/byContentType/byLesson verified against
  known review actions; USER_NOT_FOUND handled. Test data cleaned (only
  user "Ngyên" remains).
- Phase 8: seeded kanji/vocab verified (7/15, lesson+category filters, search),
  referenced-card delete blocked with CONTENT_IN_USE, unreferenced delete OK,
  management page served. Test users cleaned.
- Phase 9: NEW-only queue for fresh user, wrong card re-appears when due
  (verified via backdated nextReviewAt), due-first ordering, INVALID_CONTENT_TYPE
  rejected. Test users cleaned.
- Phase 10: full sweep OK — 9 API groups success, all pages 200, JSON files
  valid, learning data (user Ngyên) persisted across restarts.
  NOTE: real user "Ngyên" (user_001) created via UI — do not delete.

## 5. Notes for Next Agent

- Express 5 is installed (not 4). No other runtime dependencies — keep it that way without justification.
- Repositories must only use `server/utils/json-file.js`; never raw fs.
- Content repositories in Phase 3 should be one generic module parameterized by content type.
- Empty content files are intentional placeholders; Phase 3 seeds real data.

## 6. Known Issues

- None currently.

## 7. Change Log

```text
2026-08-22
- Change: Phase 10 implemented (responsive/UX polish, root README, final verification sweep).
- Reason: Completes IMPLEMENTATION_PLAN.md; Definition of Done met.
- Affected areas: public/js/review.js, public/js/flashcard.js, public/js/dashboard.js, public/pages/{learn,review,dashboard}.html, README.md.

2026-08-22
- Change: Phase 9 implemented (due-based review queue API, review session page).
- Reason: Completes the review cycle: due cards selected by nextReviewAt with NEW fill.
- Affected areas: server/services/learning.service.js, server/routes/learning.routes.js, public/pages/review.html, public/js/review.js, public/pages/dashboard.html.

2026-08-22
- Change: Phase 8 implemented (management UI for users + 4 content types, content-in-use delete guard, kanji/vocab seed data).
- Reason: CRUD management required by Definition of Done; deletion guard prevents destroying referenced learning data.
- Affected areas: public/pages/management.html, public/js/management.js, server/services/content.service.js, server/repositories/history.repository.js, server/scripts/seed-content.js.

2026-08-22
- Change: Phase 7 implemented (statistics API + real dashboard UI).
- Reason: Progress data existed but was not summarized for the user.
- Affected areas: server/services/statistics.service.js, server/routes/statistics.routes.js, public/pages/dashboard.html, public/js/dashboard.js, server/app.js.

2026-08-22
- Change: Phase 6 implemented (history API with month/result/type filters, history page).
- Reason: Review events were persisted but not visible; users need to inspect past reviews.
- Affected areas: server/services/history.service.js, server/routes/history.routes.js, public/pages/history.html, public/js/history.js, public/js/api.js, server/app.js, public/pages/dashboard.html.

2026-08-22
- Change: Phase 5 implemented (progress persistence, review scheduling, history append, learning API, flashcard wiring).
- Reason: Answers must be recorded per user with scheduled next reviews.
- Affected areas: server/utils/review-scheduler.js, server/repositories/{progress,history}.repository.js, server/services/learning.service.js, server/routes/learning.routes.js, public/js/flashcard.js, public/pages/learn.html.

2026-08-22
- Change: Phase 4 implemented (random card endpoint, learn page flashcard UI with reveal/next flow).
- Reason: Core learning interface; answer persistence follows in Phase 5.
- Affected areas: server/services/content.service.js, server/controllers/content.controller.js, server/routes/content.routes.js, public/pages/learn.html, public/js/flashcard.js, public/pages/dashboard.html.

2026-08-22
- Change: Phase 3 implemented (generic content CRUD/search/filter/pagination API, kana seed data).
- Reason: Learning phases need shared content served through APIs.
- Affected areas: server/repositories/content.repository.js, server/services/content.service.js, server/routes/content.routes.js, server/controllers/content.controller.js, server/scripts/seed-kana.js, data/content/, server/app.js.

2026-08-22
- Change: Phase 2 implemented (user CRUD API, user selection UI, current-user localStorage flow).
- Reason: Users required before content/learning phases.
- Affected areas: server/constants/, server/{routes,controllers,services,repositories}/users.*, public/index.html, public/js/user.js, public/js/current-user.js, public/pages/dashboard.html.

2026-08-22
- Change: Phase 1 implemented (Express app, JSON utility, ID/date utils, data skeleton, placeholder frontend).
- Reason: Foundation required before user/content phases.
- Affected areas: package.json, server/, public/, data/.
```
