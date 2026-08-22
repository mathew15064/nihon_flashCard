# JAPANESE FLASHCARD — OVERFLOW / PROJECT CONTEXT

## 1. PURPOSE

This document is the living context and decision log for the Japanese Flashcard application.

It exists to prevent AI coding agents from:

* Forgetting previous architectural decisions
* Reintroducing removed technologies
* Duplicating existing functionality
* Making assumptions about business rules
* Over-engineering the application
* Breaking existing JSON data
* Mixing shared content with user-specific learning data

AI agents MUST read this document before making significant changes.

---

# 2. PROJECT SUMMARY

This is a Japanese language learning web application.

The application provides flashcard-based learning for:

1. Hiragana
2. Katakana
3. Kanji
4. Vocabulary from Minna no Nihongo

The application supports multiple local users.

Users can:

* Select an existing user
* Create a new user
* Learn Japanese content
* Review previously learned content
* Track learning progress
* View learning history
* View statistics
* Manage learning content

The entire persistence layer uses JSON files.

There is intentionally NO traditional database.

---

# 3. CORE TECHNOLOGY DECISIONS

These decisions are fixed unless explicitly changed by the project owner.

## Backend

```text
Node.js
Express.js
```

## Frontend

```text
HTML
Tailwind CSS
jQuery
```

## Storage

```text
JSON files
```

---

# 4. TECHNOLOGIES THAT MUST NOT BE INTRODUCED

Do NOT introduce any of the following without explicit approval:

```text
MySQL
PostgreSQL
MongoDB
SQLite
Redis
Prisma
TypeORM
Sequelize
React
Vue
Next.js
Redux
Zustand
GraphQL
WebSocket
Microservices
CQRS
Event Sourcing
Message Queue
Kafka
RabbitMQ
Firebase
Supabase
```

The goal is a small and understandable application.

---

# 5. ARCHITECTURAL PRINCIPLE

The application follows:

```text
Frontend
    ↓
REST API
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
JSON
```

Each layer has a clear responsibility.

Do not bypass layers without a strong reason.

---

# 6. MOST IMPORTANT DATA RULE

There are two fundamentally different types of data.

## Shared Content

Examples:

```text
あ
ア
日
日本
わたし
```

Stored in:

```text
data/content/
```

## User Learning Data

Examples:

```text
User A learned 日本 5 times.
User B has never learned 日本.
User A got 日本 wrong yesterday.
User B mastered 日本.
```

Stored in:

```text
data/learning/users/{userId}/
```

These two concepts MUST remain separate.

Never add user-specific progress fields to shared content JSON.

---

# 7. DATA DIRECTORY

Current intended structure:

```text
data/
│
├── users.json
│
├── content/
│   ├── hiragana.json
│   ├── katakana.json
│   ├── kanji.json
│   └── vocabulary.json
│
└── learning/
    └── users/
        └── {userId}/
            ├── progress.json
            └── history/
                └── YYYY-MM.json
```

Do not create a separate JSON file for every card.

Do not create unnecessary duplicated data.

---

# 8. USER MODEL

Users are not authenticated accounts in the initial version.

A user represents a local learning profile.

Example:

```json
{
  "id": "user_001",
  "username": "mathew",
  "displayName": "Mathew",
  "createdAt": "...",
  "lastActiveAt": "...",
  "status": "active"
}
```

Important rules:

* `id` must be stable.
* `username` should be unique.
* Deleting a user must be treated carefully.
* Never silently delete learning history.
* User switching must not mix progress between users.

---

# 9. CURRENT USER

The initial implementation does NOT require authentication.

The selected user ID may be stored in:

```text
localStorage
```

Example:

```text
currentUserId = user_001
```

Application startup:

```text
Read currentUserId
        ↓
Validate user
        ↓
Valid?
 ┌──────┴──────┐
 YES           NO
 ↓              ↓
Dashboard    User Selection
```

Users must be able to switch users.

---

# 10. LEARNING STATES

The initial learning state model is intentionally simple.

Supported states:

```text
NEW
LEARNING
REVIEW
MASTERED
```

General progression:

```text
NEW
 ↓
LEARNING
 ↓
REVIEW
 ↓
MASTERED
```

Wrong answers may move a card back toward an earlier state.

Do not create dozens of learning states.

---

# 11. REVIEW MODEL

Each user/card relationship can contain:

```text
contentType
contentId
status
timesReviewed
correctCount
wrongCount
streak
lastReviewedAt
nextReviewAt
```

Example:

```json
{
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
```

---

# 12. REVIEW HISTORY

Every review action should create a history event.

Example:

```json
{
  "contentType": "vocabulary",
  "contentId": 1,
  "reviewedAt": "...",
  "result": "correct"
}
```

Possible results:

```text
correct
wrong
```

History is append-oriented.

Do not rewrite old history unless explicitly requested.

---

# 13. HISTORY STORAGE

History is split by month:

```text
history/
├── 2026-08.json
├── 2026-09.json
└── ...
```

This prevents an indefinitely growing single JSON file.

When writing history:

1. Determine current year/month.
2. Open/create corresponding history file.
3. Append event.
4. Persist file.

---

# 14. CONTENT TYPES

The system currently supports exactly four main content types:

```text
hiragana
katakana
kanji
vocabulary
```

Use stable content type constants.

Do not scatter string literals throughout the application.

---

# 15. CONTENT IDENTITY

Never use Japanese text as the primary ID.

Bad:

```text
日本
```

Good:

```text
kanji_001
```

or a stable numeric ID.

The content ID must remain stable even if:

* Meaning changes
* Reading changes
* Notes change
* Examples change

---

# 16. HIRAGANA

Hiragana content may support:

```text
id
character
romaji
type
```

Types may include:

```text
basic
dakuten
handakuten
combination
```

---

# 17. KATAKANA

Katakana follows the same general concept:

```text
id
character
romaji
type
```

---

# 18. KANJI

Kanji may support:

```text
id
kanji
onyomi
kunyomi
meanings
jlpt
lesson
examples
```

Not every field needs to be mandatory.

Do not assume all Kanji have the same number of readings or meanings.

---

# 19. VOCABULARY

Vocabulary may support:

```text
id
word
reading
meaning
lesson
category
examples
notes
```

Vocabulary is associated with Minna no Nihongo lessons where applicable.

Do not hard-code lesson data into frontend code.

---

# 20. SEARCH

Search is an important feature.

All meaningful content modules should support search.

Examples:

```text
/api/vocabulary?search=日本

/api/kanji?search=日

/api/hiragana?search=あ
```

Search should be handled by backend APIs.

Do not load the entire dataset into the browser just to perform basic searches if the backend can handle them.

---

# 21. FILTERING

Support filters where appropriate.

Examples:

```text
Vocabulary
→ lesson
→ category

Kanji
→ JLPT
→ lesson

Hiragana
→ type

Katakana
→ type
```

Do not create separate endpoints for every filter combination.

Prefer query parameters.

---

# 22. FLASHCARD

The flashcard is the core learning interface.

General flow:

```text
Show question
    ↓
User thinks
    ↓
Show answer
    ↓
User selects result
    ↓
Correct / Wrong
    ↓
Backend processes learning result
    ↓
Next card
```

The frontend should not decide learning state.

---

# 23. FLASHCARD DIRECTIONS

The architecture should support both directions in the future.

Example:

```text
Japanese → Meaning
```

and:

```text
Meaning → Japanese
```

Do not hard-code the flashcard system around only one direction.

However, do not implement complex quiz modes unless requested.

---

# 24. SPACED REPETITION

Spaced repetition is a planned feature.

Initial scheduling can be simple:

```text
Correct
→ 10 minutes
→ 1 day
→ 3 days
→ 7 days
→ 14 days
→ 30 days
```

Wrong answers should schedule the card sooner.

Do not implement a complex Anki/SM-2 algorithm unless explicitly requested.

The scheduling logic must remain isolated in the backend.

---

# 25. STATISTICS

Dashboard statistics should be derived from actual learning data.

Possible metrics:

```text
Total cards
Learned cards
Review cards
Mastered cards
Today's reviews
Correct rate
Current streak
Progress by content type
Progress by lesson
```

Do not store duplicated statistics unless there is a proven performance reason.

Prefer calculating them from source data.

---

# 26. DAILY LEARNING

The application should support a concept of daily review.

Example:

```text
Today's review
35 cards
```

Cards due for review should be determined from:

```text
nextReviewAt
```

Do not create a separate manually-maintained "today cards" JSON list.

---

# 27. MANAGEMENT AREA

Management is part of the application.

It should allow managing:

```text
Users
Hiragana
Katakana
Kanji
Vocabulary
```

Management functionality may include:

```text
List
Search
Filter
Create
Edit
Delete
```

Do not expose filesystem operations to the frontend.

The management UI must use REST APIs.

---

# 28. DELETE RULES

Deletion is dangerous because user progress references content IDs.

Before deleting content:

Consider whether:

```text
Existing users have progress for this content.
```

Preferred behavior:

* Soft-delete content where practical.
* Or prevent deletion when learning history references it.
* Never silently destroy historical learning information.

This decision must be finalized before implementing destructive CRUD operations.

---

# 29. JSON FILE ACCESS

All JSON file operations must be centralized.

Use a shared utility/repository layer.

Do NOT write this everywhere:

```javascript
fs.readFile(...)
fs.writeFile(...)
```

Instead use a common JSON persistence abstraction.

Example responsibility:

```text
JsonFileService
├── read()
├── write()
├── exists()
├── ensureDirectory()
└── safeWrite()
```

---

# 30. JSON CORRUPTION

Because JSON is acting as a database, file corruption is a major risk.

The system should:

* Validate JSON before writing where practical.
* Avoid partially-written files.
* Use safe/atomic writes where practical.
* Handle missing files.
* Handle invalid JSON gracefully.
* Never silently replace corrupted data with an empty array/object.

If corrupted data is detected:

```text
Return a clear server error.
Do not destroy the existing file.
```

---

# 31. BACKUP

Backup/export is a future feature.

The architecture should make it possible to export:

```text
users.json
content/
learning/
```

into a backup package.

Do not implement backup until explicitly requested.

---

# 32. API RULES

API routes should remain REST-oriented.

Example:

```text
GET    /api/users
POST   /api/users
GET    /api/users/:id
PUT    /api/users/:id
DELETE /api/users/:id
```

Learning actions can use action-oriented endpoints where appropriate:

```text
POST /api/learning/:userId/review
```

Do not expose internal repository methods as APIs.

---

# 33. API RESPONSE FORMAT

Use a consistent format.

Success:

```json
{
  "success": true,
  "data": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "User not found"
  }
}
```

Do not expose:

* Stack traces
* Filesystem paths
* Internal implementation details

---

# 34. FRONTEND RULES

jQuery is responsible for:

```text
DOM
Events
AJAX
UI state
Rendering
```

Tailwind is responsible for:

```text
Layout
Spacing
Typography
Responsive design
Visual states
```

HTML defines the page structure.

Do not introduce another frontend framework.

---

# 35. FRONTEND API ABSTRACTION

Use a shared API helper.

Avoid this pattern everywhere:

```javascript
$.ajax({
    url: "...",
    ...
});
```

Instead centralize API calls where practical.

Example concept:

```text
api.users.list()
api.users.create()
api.vocabulary.search()
api.learning.review()
```

Do not create an overly complicated frontend architecture.

---

# 36. UI/UX PRINCIPLES

The application is primarily for studying Japanese.

Therefore:

* Learning flow must be fast.
* Avoid unnecessary animations.
* Flashcard should be visually clear.
* Japanese characters should be large.
* Meaning should be visually secondary.
* Buttons should be obvious.
* Mobile support is important.
* Keyboard shortcuts may be added later.

Do not prioritize flashy UI over learning usability.

---

# 37. MOBILE

The application should be responsive.

Important pages:

```text
User selection
Dashboard
Flashcard
Review
History
Management
```

Flashcard interaction should work comfortably on mobile.

---

# 38. CURRENT PROJECT SCOPE

Current scope:

```text
User selection
Create user
Dashboard
Hiragana
Katakana
Kanji
Vocabulary
Flashcard
Progress
History
Management
Search
Filtering
Basic review scheduling
```

---

# 39. OUT OF SCOPE

Unless explicitly requested, do NOT implement:

```text
Authentication
Password
OAuth
Social login
Payments
Subscription
Cloud sync
Multi-server deployment
Real-time collaboration
AI-generated vocabulary
Speech recognition
Advanced pronunciation analysis
Complex gamification
Notifications
Mobile native application
```

---

# 40. KNOWN ARCHITECTURAL LIMITATIONS

JSON is intentionally used as storage.

Therefore:

* It is not suitable for high concurrency.
* Large datasets may become slow.
* Complex queries are limited.
* Transactions are limited.
* Concurrent writes require care.
* Data integrity must be handled by application code.

These limitations are accepted.

Do not solve them by introducing a database unless explicitly requested.

---

# 41. PERFORMANCE EXPECTATION

This application targets:

```text
Small dataset
Small number of users
Mostly local/self-hosted usage
Low concurrent writes
```

Optimize for:

```text
simplicity
reliability
maintainability
```

not massive scalability.

---

# 42. IMPORTANT: DO NOT OVER-ENGINEER

Avoid creating:

```text
AbstractFactoryFactory
GenericRepositoryFactory
BaseControllerFactory
EventBus
DomainEventSystem
Dependency injection container
Complex middleware architecture
```

unless the codebase genuinely requires it.

Simple code is preferred.

---

# 43. WHEN MAKING ARCHITECTURAL CHANGES

If a new requirement conflicts with this document:

1. Identify the conflict.
2. Explain the affected architecture.
3. Propose the smallest change.
4. Update this document.
5. Update ARCHITECTURE.md if necessary.
6. Only then implement the change.

Never silently change architectural rules.

---

# 44. AI CODING RULES

Every AI coding agent working on this project MUST:

1. Read `ARCHITECTURE.md`.
2. Read `OVERFLOW.md`.
3. Understand the current data model.
4. Check existing implementation before creating new files.
5. Reuse existing services and utilities.
6. Avoid duplicate APIs.
7. Avoid duplicate business logic.
8. Preserve existing JSON data.
9. Never reset learning progress accidentally.
10. Never replace JSON with a database.
11. Never introduce a frontend framework.
12. Keep changes focused.
13. Test the affected functionality.
14. Report architectural conflicts before making large changes.

---

# 45. CHANGE LOG

Maintain a simple architectural change log.

Format:

```text
YYYY-MM-DD
- Change:
- Reason:
- Affected areas:
```

Example:

```text
2026-08-22
- Change: User learning data separated from content data.
- Reason: Multiple users must share the same Japanese content without sharing progress.
- Affected areas: Data model, repository, learning service.
```

Keep this section updated when important architectural decisions change.

---

# 46. CURRENT DECISION LOG

## Decision 001 — JSON as database

Status:

```text
APPROVED
```

Reason:

The application is small and intended for personal/local use.

---

## Decision 002 — No authentication

Status:

```text
APPROVED
```

Reason:

The initial application only needs user profiles, not secure accounts.

---

## Decision 003 — Separate content and learning data

Status:

```text
APPROVED
```

Reason:

Multiple users must be able to learn the same content independently.

---

## Decision 004 — Express is the only backend

Status:

```text
APPROVED
```

Reason:

Simple REST API and JSON persistence are sufficient.

---

## Decision 005 — jQuery instead of React/Vue

Status:

```text
APPROVED
```

Reason:

The UI is relatively simple and does not require a large frontend framework.

---

# 47. CURRENT RISKS

The following areas require special attention during implementation:

## Risk 1 — JSON write corruption

Mitigation:

Use centralized and safe JSON writing.

## Risk 2 — User progress accidentally deleted

Mitigation:

Separate progress/history from content and be careful with destructive operations.

## Risk 3 — Duplicate business logic

Mitigation:

Keep learning rules inside backend services.

## Risk 4 — Frontend becoming too complex

Mitigation:

Keep jQuery modules small and page-oriented.

## Risk 5 — Spaced repetition becoming over-engineered

Mitigation:

Start with a simple scheduling algorithm.

---

# 48. DEFINITION OF DONE

The application is considered structurally complete when:

* Users can be selected.
* New users can be created.
* User progress is isolated.
* Hiragana works.
* Katakana works.
* Kanji works.
* Vocabulary works.
* Flashcards work.
* Correct/wrong results are persisted.
* Progress is persisted.
* History is persisted.
* Dashboard statistics work.
* Search works.
* Filters work.
* Management CRUD works.
* JSON files remain valid.
* Existing learning data survives application restarts.
* Switching users does not mix data.
* No database is required.

---

# 49. FINAL RULE

The most important rule of this project is:

> Build a small Japanese learning application, not an enterprise platform.

Prefer:

```text
Simple
Clear
Reliable
Easy to modify
Easy to understand
```

over:

```text
Highly abstract
Highly scalable
Highly distributed
Over-engineered
```

When uncertain, choose the simplest implementation that satisfies the requirement without violating the architecture.
