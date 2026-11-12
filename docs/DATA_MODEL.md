# DATA_MODEL — Japanese Flashcard

> **Lưu trữ lịch sử v1:** Tài liệu này mô tả ứng dụng Express cũ, không phải Fastify v2. Nihon v2 chỉ dùng MySQL 8.4; xem [hướng dẫn cài đặt mới](UI_FIRST_INSTALL.md) và [app/README.md](../app/README.md).

## 1. SQLite Schema (`data/app.db`)

Primary persistence layer powered by Node 22 `node:sqlite`.

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  data TEXT NOT NULL,
  lesson INTEGER,
  category TEXT,
  jlpt TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_lesson ON content(content_type, lesson);

CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL,
  times_reviewed INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  last_reviewed_at TEXT,
  next_review_at TEXT,
  PRIMARY KEY (user_id, card_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_progress_due ON progress(user_id, next_review_at);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  content_type TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  result TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_history_user_time ON history(user_id, reviewed_at);
```

---

## 2. Legacy JSON Structures (Historical Reference / Import Source)

### 2.1 Users — `data/users.json` (Legacy)

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

Dates: ISO 8601 UTC strings.

### 2.2 Content files — `data/content/*.json` (Import Source)

#### Hiragana / Katakana

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

#### Kanji

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

#### Vocabulary

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

### 2.3 Content identity

- Stable IDs (`{type}_NNN`). Japanese text is never the primary key.
- IDs never reused after deletion.

### 2.4 Progress — `data/learning/users/{userId}/progress.json` (Legacy)

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

### 2.5 History — `data/learning/users/{userId}/history/YYYY-MM.json` (Legacy)

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

- Append-only review events.
- `result`: `correct | wrong`.

## 3. Relationships

```text
users 1 ─── N progress cards        (via user_id foreign key)
content 1 ─── N progress entries    (via card_id)
progress entry 1 ─── N history events (via user_id, card_id)
```

No embedded/duplicated statistics anywhere; derived on demand by statistics.service.
