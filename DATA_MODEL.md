# DATA_MODEL — Japanese Flashcard

## 1. Users — `data/users.json` (array)

```json
{
  "id": "user_001",
  "username": "mathew",
  "displayName": "Mathew",
  "createdAt": "2026-08-22T10:00:00.000Z",
  "lastActiveAt": "2026-08-22T10:00:00.000Z",
  "status": "active"
}
```

- `id`: `user_` + zero-padded counter / generated, stable forever.
- `username`: unique (case-insensitive), required.
- `status`: `active` | `inactive`. Inactive users cannot be selected but data is kept.
- Deletion: only allowed when no learning directory exists; otherwise require explicit confirmation and archive learning data (never silently destroy history).

Dates: ISO 8601 UTC strings.

## 2. Content files — `data/content/*.json` (arrays)

### Hiragana / Katakana

```json
{
  "id": "hiragana_001",
  "character": "あ",
  "romaji": "a",
  "type": "basic"
}
```

`type`: `basic | dakuten | handakuten | combination`.
Katakana identical shape with `katakana_` prefixed IDs.

### Kanji

```json
{
  "id": "kanji_001",
  "kanji": "日",
  "onyomi": ["ニチ", "ジツ"],
  "kunyomi": ["ひ", "か"],
  "meanings": ["day", "sun"],
  "jlpt": "N5",
  "lesson": 1,
  "examples": [
    { "word": "日本", "reading": "にほん", "meaning": "Japan" }
  ]
}
```

Only `id` and `kanji` are mandatory.

### Vocabulary

```json
{
  "id": "vocabulary_001",
  "word": "わたし",
  "reading": "わたし",
  "meaning": "I, me",
  "lesson": 1,
  "category": "pronoun",
  "examples": [],
  "notes": ""
}
```

Only `id`, `word`, `meaning` mandatory. `lesson` links to Minna no Nihongo lessons (integer ≥ 1).

### Content identity

- Stable IDs (`{type}_NNN`). Japanese text is never the primary key.
- IDs never reused after deletion.

## 3. Progress — `data/learning/users/{userId}/progress.json`

```json
{
  "userId": "user_001",
  "updatedAt": "...",
  "cards": {
    "vocabulary_001": {
      "cardId": "vocabulary_001",
      "contentType": "vocabulary",
      "contentId": 1,
      "status": "learning",
      "timesReviewed": 5,
      "correctCount": 4,
      "wrongCount": 1,
      "streak": 2,
      "lastReviewedAt": "...",
      "nextReviewAt": "..."
    }
  }
}
```

- Keyed by stable `cardId` (= content ID) for O(1) lookup.
- Cards absent from the map are implicitly `NEW`.
- `status`: `new | learning | review | mastered` (see LEARNING_SYSTEM.md).

## 4. History — `data/learning/users/{userId}/history/YYYY-MM.json`

```json
[
  {
    "cardId": "vocabulary_001",
    "contentType": "vocabulary",
    "contentId": 1,
    "reviewedAt": "...",
    "result": "correct"
  }
]
```

- Append-only array per month file. Old months never rewritten.
- `result`: `correct | wrong`.

## 5. Relationships

```text
users.json 1 ─── N progress cards        (via userId directory)
content/*.json 1 ─── N progress entries  (via cardId = content id)
progress entry 1 ─── N history events    (via cardId)
```

No embedded/duplicated statistics anywhere; derived on demand by statistics.service.
