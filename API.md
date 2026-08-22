# API — Japanese Flashcard

Base: `/api`. All responses use the envelope:

```json
{ "success": true, "data": ... }
```

Errors:

```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

Common error codes:
`VALIDATION_ERROR` (400), `USER_NOT_FOUND` (404), `CONTENT_NOT_FOUND` (404),
`USERNAME_TAKEN` (409), `USER_INACTIVE` (409), `INVALID_CONTENT_TYPE` (400),
`INTERNAL_ERROR` (500).

---

## Users

| Method | Path | Notes |
|---|---|---|
| GET | /api/users | list; `?status=active` filter |
| GET | /api/users/:id | 404 if missing |
| POST | /api/users | body `{username, displayName?}`; unique username |
| PUT | /api/users/:id | body `{displayName?, status?, lastActiveAt?}` |
| DELETE | /api/users/:id | blocked if learning data exists unless `?force=true`; then archives learning dir |

## Content (`hiragana`, `katakana`, `kanji`, `vocabulary`)

Identical CRUD pattern per type:

```text
GET    /api/hiragana        GET    /api/hiragana/:id
POST   /api/hiragana        PUT    /api/hiragana/:id
DELETE /api/hiragana/:id
```

Query parameters (list endpoints):

- All types: `search=` (matches character/romaji/word/kanji/meaning/reading), `page`, `limit` (default limit 100, max 500).
- hiragana/katakana: `type=basic|dakuten|handakuten|combination`
- kanji: `jlpt=N5..N1`, `lesson=`
- vocabulary: `lesson=`, `category=`

POST/PUT bodies follow DATA_MODEL.md field definitions. Server assigns IDs on POST. DELETE is soft-blocked when any user's progress/history references the card.

Random selection:

```text
GET /api/:contentType/random?count=10&exclude=mastered&userId=user_001
```

Returns N random cards; with `userId`, prioritizes NEW + due cards for study sessions.

## Learning

```text
GET  /api/learning/:userId                 → summary of progress map
GET  /api/learning/:userId/review          → next due card(s): ?contentType=&count=
POST /api/learning/:userId/review          → record an answer
GET  /api/learning/:userId/progress        → full progress.json data
```

Review request body:

```json
{ "contentType": "vocabulary", "contentId": 1, "result": "correct" }
```

Response: updated card progress `{cardId, status, streak, timesReviewed, correctCount, wrongCount, lastReviewedAt, nextReviewAt}`.

Server-side flow: validate user/contentType/contentId/result → update progress → compute state & next review → append history → persist → respond.

## History

```text
GET /api/history/:userId                   → ?month=YYYY-MM (default current), ?contentType=, ?page=&limit=
```

## Statistics

```text
GET /api/statistics/:userId                → dashboard payload
```

Response shape:

```json
{
  "totals": { "learned": 0, "reviewDue": 0, "mastered": 0, "streakDays": 0, "todayReviews": 0 },
  "byContentType": {
    "hiragana": { "total": 46, "new": 0, "learning": 3, "review": 2, "mastered": 41 },
    "katakana": { }, "kanji": { }, "vocabulary": { }
  },
  "byLesson": { "vocabulary": { "1": { "total": 50, "learned": 12 } } }
}
```

Derived entirely from content + progress + history at request time.

## Static

Express serves `public/` only. `/data` is never exposed.
