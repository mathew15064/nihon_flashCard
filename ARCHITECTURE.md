# ARCHITECTURE — Japanese Flashcard

Authoritative architecture document. `doc/architecture.md` is the source specification; this file restates the decided architecture for implementation.

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
├── README.md / ARCHITECTURE.md / OVERFLOW.md
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

## 6. JSON File Safety

- All fs access centralized in `server/utils/json-file.js`.
- Atomic writes (write temp file then rename). Missing file → return empty default where safe; invalid JSON → throw a clear server error, never overwrite.
- Concurrency: assume low volume; serialize writes per process (simple in-memory queue inside `json-file.js`) to avoid read-modify-write races.

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

## 10. Current User Flow

Startup: read `currentUserId` from localStorage → validate via `GET /api/users/:id` → dashboard if valid, else user selection. User switching always allowed.

## 11. i18n Architecture

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

## 12. Flashcard Gesture Architecture

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
- Card advancement happens ONLY on API success. On failure the current card
  stays visible, position is restored, and the user can retry.
- `pointercancel` always resets drag state — it never commits an answer.
- `submitting`/`answered` flags guarantee one review request per card.

## 13. Vocabulary Display Model

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
