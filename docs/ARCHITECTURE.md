# ARCHITECTURE — Japanese Flashcard

Authoritative architecture document. `docs/spec/spec-architecture.md` is the source specification; this file restates the decided architecture for implementation.

## 1. System Overview

```text
Browser (HTML + Tailwind + jQuery)
        ↓
REST API
        ↓
Express.js
        ↓
Controller → Service → Repository
        ↓
JSON files (data/)
```

- Backend: Node.js + Express.js. The only backend.
- Frontend: static HTML pages, Tailwind CSS, jQuery. No SPA framework.
- Persistence: JSON files only. No database.
- No authentication in v1. Selected user stored in `localStorage` (`currentUserId`).

## 2. Folder Structure

```text
japanese-flashcard/
├── package.json
├── README.md
├── docs/                    # all project docs (ARCHITECTURE, OVERFLOW, API, ...)
│   └── spec/                # original pre-implementation specs
│
├── server/
│   ├── app.js              # Express app setup, middleware, route mounting
│   ├── server.js           # HTTP listener
│   ├── routes/             # users, hiragana, katakana, kanji, vocabulary,
│   │                       # learning, history, statistics routes
│   ├── controllers/        # request/response handling only
│   ├── services/           # business logic:
│   │   ├── user.service.js
│   │   ├── content.service.js      # shared logic for the 4 content types
│   │   ├── learning.service.js     # flashcard engine + scheduling
│   │   ├── history.service.js
│   │   └── statistics.service.js
│   ├── repositories/       # JSON persistence per concern:
│   │   ├── user.repository.js
│   │   ├── content.repository.js   # parameterized by content type
│   │   ├── progress.repository.js
│   │   └── history.repository.js
│   ├── utils/
│   │   ├── json-file.js    # ONLY place that touches fs for JSON
│   │   ├── id-generator.js
│   │   └── date.js
│   └── constants/
│       ├── content-types.js   # hiragana | katakana | kanji | vocabulary
│       ├── learning-status.js # NEW | LEARNING | REVIEW | MASTERED
│       └── review-result.js   # correct | wrong
│
├── data/
│   ├── users.json
│   ├── content/{hiragana,katakana,kanji,vocabulary}.json
│   └── learning/users/{userId}/
│       ├── progress.json
│       └── history/YYYY-MM.json
│
└── public/
    ├── index.html          # user selection
    ├── pages/{dashboard,learn,review,history,management}.html
    ├── js/                 # api.js abstraction + one module per page
    │   └── i18n/           # en.js, vi.js (dictionaries) + i18n.js (runtime)
    └── css/app.css
```

Rules:

- One repository may serve all four content types via a `contentType` parameter; do not duplicate four identical repositories.
- Do not create extra layers/files beyond those justified above.

## 3. Responsibilities

| Layer | Responsibility |
|---|---|
| Route | URL → controller mapping only |
| Controller | Validate request shape, call service, format response `{success, data}` / `{success, error}` |
| Service | All business rules: learning state machine, review scheduling, statistics, validation of domain rules |
| Repository | Read/write JSON through `json-file.js`, scoped by user/content type |
| json-file util | read, write (atomic), exists, ensureDirectory, corrupt-file error handling |
| Frontend | Rendering, interaction, AJAX via `api.js` helper, loading/error states |

Frontend MUST NOT: access JSON, compute authoritative progress/schedule/mastery.
Backend is the single source of truth.

## 4. Data Flow (review example)

```text
POST /api/learning/:userId/review {contentType, contentId, result}
→ learning.controller → learning.service
  1. validate user, contentType, contentId, result
  2. load progress.json (progress.repository)
  3. update card status/streak/counters, compute nextReviewAt
  4. save progress.json
  5. append event to history/YYYY-MM.json
→ respond with updated card state
```

## 5. Content vs Learning Data (mandatory separation)

- Shared content: `data/content/*.json` — what everyone learns. Never contains user fields.
- User learning data: `data/learning/users/{userId}/` — how a specific user learns it.

## 6. SQLite Transaction Safety (Replaced JSON Files)

- Storage persistence has moved to SQLite via Node 22's built-in `node:sqlite`.
- WAL mode and transaction semantics ensure consistency and crash safety.
- `server/utils/json-file.js` remains for backward-compatible utilities but is no longer the persistence layer.

## 7. API & Error Conventions

See API.md. Uniform envelope:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "USER_NOT_FOUND", "message": "..." } }
```

Never expose stack traces or filesystem paths.

## 8. Security Scope

No auth. Required minimum: input validation, path traversal prevention (user IDs/content types validated against allow-lists), `/data` never served statically.

## 9. Quiz Architecture

A multiple-choice quiz mode layered on top of the existing content and learning
systems. It introduces NO new storage.

```text
POST /api/quiz/sessions                     → create session + questions
POST /api/quiz/sessions/:sid/answers        → submit one answer
GET  /api/quiz/sessions/:sessionId/result   → final score (requires all answered)
```

Components:

- `server/utils/quiz-generator.js` — pure question generation:
  question types `jp-to-meaning`, `meaning-to-jp`, `jp-to-reading`,
  `reading-to-jp`, `random`; distractors sampled only from the same content type;
  a card is skipped if fewer than 2 valid distinct distractors exist.
- `server/services/quiz.service.js` — session lifecycle, validation
  (user active, type/count/question-type validity, option IDs, ownership,
  single-answer enforcement), scoring. Sessions live IN MEMORY ONLY
  (Map keyed by random session id); they are lost on restart by design.
  Correct answers never leave the server before submission (`_correctOptionId`
  is stripped from all question responses).
- Learning integration: each answer calls `learning.service.recordReview`
  (same progress/scheduling/history pipeline as flashcards). No second progress system.
- Quiz results are NOT persisted separately; per-question review events in the
  existing monthly history files are the record.

Frontend: single page `public/pages/quiz.html` + `public/js/quiz.js`
(config → play → result states), keyboard shortcuts A–D / 1–4 / Enter.

Frontend: single page `public/pages/quiz.html` + `public/js/quiz.js`
(config → play → result states), keyboard shortcuts A–D / 1–4 / Enter.

## 10. Image Architecture (vocabulary, optional)

Vocabulary items may carry an optional `image` object; `null` means no image.

```json
"image": {
  "url": "https://upload.wikimedia.org/...",
  "thumbnailUrl": "https://upload.wikimedia.org/.../500px-...",
  "source": "Wikimedia Commons",
  "sourceUrl": "https://commons.wikimedia.org/wiki/File:...",
  "license": "CC BY-SA 4.0",
  "author": "..."
}
```

Layers:

```text
server/services/image/
├── image.service.js            # provider abstraction + metadata validation
└── providers/wikimedia.provider.js   # default provider (no API key)
```

- **Search**: `GET /api/images/search?q=<query>&limit=` → normalized results
  `{ url, thumbnailUrl, title, source, sourceUrl, license, author }`.
  Only Management uses this endpoint. The Learn page NEVER searches live —
  it only renders URLs already stored in vocabulary JSON (deterministic,
  fast, no quota use).
- **Provider abstraction**: `imageService.search()` delegates to the active
  provider (`IMAGE_PROVIDER` env, default `wikimedia`). Future providers plug
  in as new files under `providers/`; any needed API key comes from
  `IMAGE_PROVIDER_API_KEY` env — never hard-coded. App works with no
  provider configured.
- **Validation** (`normalizeImageMetadata`, applied on every content update):
  `image.url` required; url/thumbnailUrl/sourceUrl must be valid http(s)
  URLs — `javascript:` / `data:` / `file:` are rejected. `null` clears.
- **Storage**: remote URL metadata in JSON only. No binaries, no database;
  model leaves room for a future local cache.
- **Rendering** (flashcard.js): image sits between word and reading lines
  (hierarchy: word → image → reading → romanization → meaning), shown only
  after reveal. Safe DOM property assignment (`.src =`), skeleton while
  loading, container hidden on error (card stays fully usable). Alt text is
  localized ("word - meaning"). Only the NEXT card's image is preloaded.
  Swipe/tap gestures are bound to the whole card and unaffected by the image.

## 11. Current User Flow

Startup: read `currentUserId` from localStorage → validate via `GET /api/users/:id` → dashboard if valid, else user selection. User switching always allowed.

## 12. i18n Architecture

Two distinct concepts that must not be mixed:

- **UI i18n** — application chrome strings ("Correct" → "Đúng"). Handled by the
  client-side `I18n` runtime.
- **Content translation** — meaning data of vocabulary items ("Japan" → "Nhật Bản").
  Belongs to content JSON, returned by the API as-is; never stored in i18n files.

Implementation (no external framework):

```text
public/js/i18n/
├── vi.js     # window.I18N_VI dictionary (default locale)
├── en.js     # window.I18N_EN dictionary
└── i18n.js   # I18n runtime: t(path), apply(), setLocale(), locale()
```

- Selected locale persisted in `localStorage` key `locale`; default `vi`.
- Static HTML elements are translated via `data-i18n="dotted.key"` attributes,
  refreshed by `I18n.apply()` on load and on locale change.
- Dynamic strings use `I18n.t('key', {vars})` at render time.
- Pages listen to the `locale:changed` document event to re-render translated
  dynamic state without reloading.
- Fallback for a missing key: selected locale → Vietnamese → raw key.
- Language switcher (`#locale-select`, 🇻🇳/🇺🇸) is included in learn.html and
  review.html headers.

## 13. Flashcard Gesture Architecture

`public/js/flashcard.js` exposes named responsibilities:
`loadCards → renderCard → revealCard → handleAnswer → showFeedback → nextCard`,
plus `handleSwipe*` and keyboard handling.

- ALL answering mechanisms converge on one function: `handleAnswer(result)`.
  Buttons, ArrowRight/ArrowLeft keys, and swipes call nothing else.
- Swipe uses Pointer Events (`pointerdown/move/up/cancel`) so touch, mouse and
  pen all work. Only horizontal movement is tracked; `touch-action: pan-y`
  keeps vertical scrolling intact.
- Threshold: 100 px horizontal drag while the card is revealed AND not already
  answered. Below threshold the card springs back; above threshold it flies out
  (CSS transform/transition only) and the answer is committed once
  (`answered` guard prevents duplicates).
- During drag the card follows the pointer with slight rotation and shows a
  badge: right → "✓ Correct", left → "✕ Wrong".
- Swipe is an enhancement only — buttons and keyboard shortcuts remain fully
  functional and accessible.

## 14. Study Sessions (lesson chunking)

A CONTENT LESSON and a LEARNING SESSION are different concepts:

```text
CONTENT: Lesson 1 (40 vocabulary items, lesson=1 unchanged)
LEARNING: Session 1 → items 1–10 · Session 2 → 11–20 · ...
PROGRESS: stays per card in progress.json — sessions own nothing
```

- `server/constants/study-session.js` — `DEFAULT_SESSION_SIZE = 10`
  (single central constant).
- `server/utils/session-chunker.js` — deterministic chunking of a stable,
  id-sorted item list; remainder becomes a smaller final session.
- `server/services/study-session.service.js` — derives sessions from content
  on demand (nothing persisted), computes per-session progress from existing
  card progress (`status !== 'new'` = introduced). No duplicate records,
  no new progress system; review scheduling untouched.
- APIs:
  - `GET /api/learning/:userId/sessions?contentType&lesson` → session list
    with derived progress (`LESSON_NOT_FOUND` for empty lessons)
  - `GET /api/learning/:userId/sessions/cards?contentType&lesson&session`
    → only that session's cards (`SESSION_NOT_FOUND` if out of range)
- Learn page: "All lessons" keeps the original random mode; picking a lesson
  shows a mobile-first session list (✓ done / → in progress / ○ not started,
  progress bar, Start/Continue, recommended next highlighted). Finishing a
  session returns to the refreshed overview. Review page works independently
  of sessions.
- Card advancement happens ONLY on API success. On failure the current card
  stays visible, position is restored, and the user can retry.
- `pointercancel` always resets drag state — it never commits an answer.
- `submitting`/`answered` flags guarantee one review request per card.
- Learn page is mobile-first: `100dvh` flex column (header → progress →
  flexible spacer → card → flexible spacer → controls with safe-area padding).
  The card sits in the lower-middle thumb zone; spacers are proportional
  (`flex-[2]` / `flex-[3]`) so the layout adapts to any viewport height,
  including landscape. Card uses `w-[calc(100vw-32px)]`, `min-h-[42dvh]`
  on mobile and desktop breakpoints (`sm:`) restore the centered layout.
- Tap vs swipe: a tap (|deltaX| small) reveals; only |deltaX| ≥ threshold
  commits an answer; the two are mutually exclusive per gesture
  (`dragMoved` suppresses click-reveal after real drags).

## 15. Vocabulary Display Model

Vocabulary schema (additive extension, backward compatible):

```json
{
  "id": "vocabulary_001",
  "word": "日本",
  "reading": "にほん",
  "romanization": "nihon",        // optional, new
  "meaning": "Japan",             // base/English string (unchanged legacy field)
  "meaningVi": "Nhật Bản",        // optional, new
  "lesson": 1, "category": "...", "notes": "", "examples": []
}
```

- `meaning` stays a plain string so quiz generation, search and management CRUD
  keep working unchanged. `romanization` / `meaningVi` are optional additive
  fields accepted by `content.service.validate`.
- Frontend fallback for displayed meaning: selected locale → English
  (`meaning`) → Vietnamese (`meaningVi`) → empty (never "undefined").
  If `meaning` is ever an object `{vi,en}`, it is handled too.
- Card hierarchy after reveal: word → reading → romanization → separator →
  localized meaning. Reading is hidden until reveal; romanization is shown only
  when present (never invented). Kana cards show character → romaji;
  kanji cards show kanji → meanings → on/kun readings.

## 16. SQLite Persistence

- **Engine**: Node 22 built-in `node:sqlite` (`DatabaseSync`), requiring zero external dependencies.
- **Data directory layout**: `data/app.db` with WAL mode (`app.db-wal`, `app.db-shm`) enabled for concurrent reads and crash safety.
- **Schema tables**:
  - `users`: user accounts (id, username UNIQUE COLLATE NOCASE, display_name, status, created_at, last_active_at).
  - `content`: learning materials (id, content_type, data JSON blob, lesson, category, jlpt, timestamps).
  - `progress`: user card status & SRS state (user_id, card_id, content_type, status, times_reviewed, correct_count, wrong_count, streak, last_reviewed_at, next_review_at).
  - `history`: immutable log of review events (id, user_id, card_id, content_type, reviewed_at, result).
- **Content storage**: full item serialized as JSON in `data` column; extracted columns (`lesson`, `category`, `jlpt`) indexed for fast filtering.
- **Import-once behavior**: `server/db/import-content.js` populates the `content` table from `data/content/*.json` only when the `content` table is completely empty.
- **DB_PATH environment override**: supports pointing to an alternate database path (e.g. `process.env.DB_PATH`).
- **Test isolation**: every test run creates an isolated tmp DB file and points `DB_PATH` to it, ensuring tests never pollute or depend on production data in `data/app.db`.

