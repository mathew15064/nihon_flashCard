# LEARNING_SYSTEM — Japanese Flashcard

> **Lưu trữ lịch sử v1:** Tài liệu này mô tả ứng dụng Express cũ, không phải Fastify v2. Nihon v2 chỉ dùng MySQL 8.4; xem [hướng dẫn cài đặt mới](UI_FIRST_INSTALL.md) và [app/README.md](../app/README.md).

All logic in this document lives in `server/services/learning.service.js` (plus a small `review-scheduler.js` for interval math). The frontend only renders results.

## 1. Learning States

```text
NEW → LEARNING → REVIEW → MASTERED
```

| Status | Meaning |
|---|---|
| new | never reviewed (no progress entry) |
| learning | seen, streak < 2 |
| review | known; in scheduled review cycle (streak ≥ 2) |
| mastered | reached 30-day interval with correct answer |

Wrong answers demote: `mastered/review → learning` and reset `streak` to 0.

## 2. Review Flow

```text
Show question → user thinks → reveal answer
→ user marks Correct or Wrong
→ POST /api/learning/:userId/review
→ backend updates progress + history → next card
```

Card selection (`GET /api/learning/:userId/review`):

1. Cards with `nextReviewAt <= now`, ordered by due date.
2. If fewer than requested count, fill with random NEW cards of the chosen content type.
3. Optional `contentType` filter restricts to one type.

## 3. Scheduling (initial simple algorithm)

Interval ladder on consecutive correct answers:

```text
streak 0 → 10 minutes
1 → 1 day
2 → 3 days
3 → 7 days
4 → 14 days
5+ → 30 days   (reaching this ladder step sets status = mastered)
```

Wrong answer: `nextReviewAt = now + 10 minutes`, `streak = 0`.

Counters updated on every review: `timesReviewed++`, `correctCount++` / `wrongCount++`, `lastReviewedAt = now`.

The ladder is a single constant array in one module — replaceable later with SM-2 without touching any other code.

## 4. Progress Calculation

Progress is stored per card (see DATA_MODEL.md) and updated transactionally per review. Statistics are derived at read time by `statistics.service.js`; nothing pre-aggregated.

## 5. History

Every accepted review appends one event to the current month file `history/YYYY-MM.json`. Appends are atomic; old months are immutable.

## 6. Future Spaced Repetition Strategy

Keep interface stable: `scheduler.schedule(card, result) → {status, nextReviewAt}`. Swapping in SM-2 (ease factor, interval fuzzing) only touches that module plus optional extra fields on the progress entry — backward compatible since JSON entries tolerate additional keys.
