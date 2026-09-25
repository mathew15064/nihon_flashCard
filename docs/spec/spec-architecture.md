> Original specification. Superseded by docs/ARCHITECTURE.md
# JAPANESE FLASHCARD APP — ARCHITECTURE SPECIFICATION

## 1. ROLE

You are a senior software architect.

Your task is to design the architecture for a small Japanese learning / flashcard web application.

IMPORTANT:

* Do NOT implement the application yet.
* Do NOT generate production code.
* Do NOT create unnecessary abstractions.
* First analyze the requirements and define a clean, simple architecture.
* The architecture must be easy for another AI agent to implement phase-by-phase.
* Prioritize simplicity, maintainability, and clear separation of responsibilities.

The application is a personal/small-user Japanese learning system.

---

# 2. CORE TECHNOLOGY

Use exactly the following technologies unless there is a strong architectural reason not to.

## Backend

* Node.js
* Express.js

## Frontend

* HTML
* Tailwind CSS
* jQuery

## Data storage

* JSON files only

DO NOT use:

* MySQL
* PostgreSQL
* MongoDB
* SQLite
* Prisma
* TypeORM
* Sequelize
* Redis
* Firebase
* Supabase
* Any external database

JSON files are the application's persistence layer.

---

# 3. MAIN FEATURES

The application has four main learning content types:

1. Hiragana
2. Katakana
3. Kanji
4. Vocabulary from Minna no Nihongo

The application also needs a user system.

When a user opens the application:

1. Show user selection screen.
2. Display existing users.
3. Allow selecting an existing user.
4. Allow creating a new user.
5. After selecting/creating a user, enter the main dashboard.

No password/authentication system is required for the initial version.

The selected user determines all learning progress and history.

---

# 4. HIGH-LEVEL ARCHITECTURE

Use this architecture:

Browser
↓
HTML + Tailwind CSS + jQuery
↓
REST API
↓
Express.js
↓
Service Layer
↓
JSON Data Layer
↓
JSON Files

The frontend MUST NOT directly read or modify JSON files.

All persistence operations must go through Express.js APIs.

---

# 5. RECOMMENDED PROJECT STRUCTURE

Design the project around the following structure:

```text
japanese-flashcard/
│
├── package.json
├── README.md
├── .gitignore
│
├── server/
│   ├── app.js
│   ├── server.js
│   │
│   ├── routes/
│   │   ├── users.routes.js
│   │   ├── hiragana.routes.js
│   │   ├── katakana.routes.js
│   │   ├── kanji.routes.js
│   │   ├── vocabulary.routes.js
│   │   ├── learning.routes.js
│   │   ├── history.routes.js
│   │   └── statistics.routes.js
│   │
│   ├── controllers/
│   │   ├── users.controller.js
│   │   ├── hiragana.controller.js
│   │   ├── katakana.controller.js
│   │   ├── kanji.controller.js
│   │   ├── vocabulary.controller.js
│   │   ├── learning.controller.js
│   │   ├── history.controller.js
│   │   └── statistics.controller.js
│   │
│   ├── services/
│   │   ├── user.service.js
│   │   ├── content.service.js
│   │   ├── learning.service.js
│   │   ├── history.service.js
│   │   └── statistics.service.js
│   │
│   ├── repositories/
│   │   ├── user.repository.js
│   │   ├── content.repository.js
│   │   ├── progress.repository.js
│   │   └── history.repository.js
│   │
│   ├── utils/
│   │   ├── json-file.js
│   │   ├── id-generator.js
│   │   └── date.js
│   │
│   └── constants/
│       ├── content-types.js
│       ├── learning-status.js
│       └── review-result.js
│
├── data/
│   ├── users.json
│   │
│   ├── content/
│   │   ├── hiragana.json
│   │   ├── katakana.json
│   │   ├── kanji.json
│   │   └── vocabulary.json
│   │
│   └── learning/
│       └── users/
│           └── {userId}/
│               ├── progress.json
│               └── history/
│                   └── YYYY-MM.json
│
└── public/
    ├── index.html
    │
    ├── pages/
    │   ├── dashboard.html
    │   ├── learn.html
    │   ├── review.html
    │   ├── history.html
    │   └── management.html
    │
    ├── js/
    │   ├── app.js
    │   ├── api.js
    │   ├── user.js
    │   ├── dashboard.js
    │   ├── flashcard.js
    │   ├── review.js
    │   ├── history.js
    │   └── management.js
    │
    └── css/
        └── app.css
```

You may adjust this structure if there is a strong reason.

Do not create files simply to satisfy architectural patterns.

---

# 6. DATA ARCHITECTURE

JSON is the database.

Separate CONTENT from USER LEARNING DATA.

This separation is mandatory.

## Content data

```text
data/content/
├── hiragana.json
├── katakana.json
├── kanji.json
└── vocabulary.json
```

These files represent shared learning content.

They should NOT contain user-specific progress.

---

# 7. USER DATA

Use:

```text
data/users.json
```

Example conceptual structure:

```json
[
  {
    "id": "user_001",
    "username": "mathew",
    "displayName": "Mathew",
    "createdAt": "...",
    "lastActiveAt": "...",
    "status": "active"
  }
]
```

The architecture must define:

* User ID strategy
* Username uniqueness
* User creation
* User update
* User deletion
* Active/inactive state
* Last active timestamp

No authentication is required in the initial version.

---

# 8. USER LEARNING DATA

Each user gets an isolated learning directory.

```text
data/learning/users/{userId}/
├── progress.json
└── history/
    ├── 2026-08.json
    ├── 2026-09.json
    └── ...
```

This prevents different users from mixing their learning data.

---

# 9. PROGRESS DATA

Define a structure that can track each learning card.

Each card should be identifiable by:

```text
contentType
contentId
```

Example:

```json
{
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
```

Define the following learning states:

* NEW
* LEARNING
* REVIEW
* MASTERED

Do not overcomplicate the state machine.

---

# 10. REVIEW HISTORY

Every time the user answers a flashcard, record a history event.

Example conceptual structure:

```json
{
  "cardId": "vocabulary_001",
  "contentType": "vocabulary",
  "contentId": 1,
  "reviewedAt": "...",
  "result": "correct"
}
```

Possible results:

* correct
* wrong

History should be append-oriented.

Do not rewrite the entire historical record unnecessarily.

Prefer monthly history files:

```text
history/YYYY-MM.json
```

This prevents a single history file from becoming unnecessarily large.

---

# 11. CONTENT MODELS

Define models for:

## Hiragana

Support:

* id
* character
* romaji
* category/type

Categories may include:

* basic
* dakuten
* handakuten
* combination

---

## Katakana

Same general structure as Hiragana.

Support:

* id
* character
* romaji
* category/type

---

## Kanji

Support fields such as:

* id
* kanji
* onyomi
* kunyomi
* meanings
* jlpt
* examples
* lesson

Do not assume every field is mandatory.

---

## Vocabulary

Support:

* id
* word
* reading
* meaning
* lesson
* category/type
* examples
* notes

The architecture should allow vocabulary to be associated with Minna no Nihongo lessons.

---

# 12. CONTENT IDENTITY

Never use the displayed Japanese word itself as the primary identifier.

Use stable IDs.

For example:

```text
vocabulary_001
kanji_001
hiragana_001
katakana_001
```

The ID must remain stable even if the displayed content changes.

---

# 13. API ARCHITECTURE

Design REST APIs.

Suggested structure:

## Users

```text
GET    /api/users
GET    /api/users/:id
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
```

---

## Hiragana

```text
GET    /api/hiragana
GET    /api/hiragana/:id
POST   /api/hiragana
PUT    /api/hiragana/:id
DELETE /api/hiragana/:id
```

Same pattern for:

```text
/api/katakana
/api/kanji
/api/vocabulary
```

---

# 14. SEARCH AND FILTER

All content modules should support search where meaningful.

Examples:

```text
GET /api/vocabulary?search=日本
GET /api/vocabulary?lesson=1
GET /api/kanji?jlpt=N5
GET /api/hiragana?type=dakuten
```

The architecture should support:

* Search
* Filtering
* Pagination where necessary
* Random card selection

Do not create separate APIs for every possible filter combination.

---

# 15. LEARNING API

Design APIs around learning actions rather than exposing JSON internals.

Example:

```text
GET  /api/learning/:userId
GET  /api/learning/:userId/review
POST /api/learning/:userId/review
GET  /api/learning/:userId/progress
```

Review request:

```json
{
  "contentType": "vocabulary",
  "contentId": 1,
  "result": "correct"
}
```

The backend should:

1. Validate the user.
2. Validate the content.
3. Update progress.
4. Calculate learning state.
5. Calculate next review time.
6. Record history.
7. Persist JSON.
8. Return updated learning state.

The frontend must not calculate or modify learning state.

---

# 16. FLASHCARD ENGINE

Create a dedicated learning service.

Responsibilities:

* Select cards
* Random cards
* Review cards
* Determine card status
* Process correct answers
* Process wrong answers
* Calculate next review
* Update progress
* Return next card

The flashcard UI should not contain learning algorithm logic.

---

# 17. SPACED REPETITION

Do NOT implement a complicated algorithm initially.

Design the architecture so it can support spaced repetition later.

Initial simple algorithm may use intervals such as:

```text
NEW
↓
Correct
↓
10 minutes
↓
1 day
↓
3 days
↓
7 days
↓
14 days
↓
30 days
```

Wrong answers should move the card toward an earlier review.

Keep the algorithm isolated inside:

```text
learning.service.js
```

or a dedicated:

```text
review-scheduler.js
```

Do not spread scheduling logic across controllers or frontend code.

---

# 18. DASHBOARD

Dashboard should show:

* Current user
* Total learned cards
* Cards needing review
* Mastered cards
* Current streak
* Today's review count
* Progress by content type
* Progress by vocabulary lesson

Example:

```text
Hiragana       46 / 46
Katakana       40 / 46
Kanji          35 / 100
Vocabulary     120 / 300
```

Statistics must be derived from learning data.

Do not duplicate unnecessary statistics into multiple JSON files unless performance requires it.

---

# 19. USER FLOW

Define this main flow:

```text
Open website
    ↓
User Selection
    ├── Existing user
    │      ↓
    │   Select user
    │      ↓
    └── New user
           ↓
       Create user
           ↓
      Dashboard
           ↓
   ┌───────┼────────┐
   ↓       ↓        ↓
 Learn   Review   History
   │       │        │
   └───────┼────────┘
           ↓
       Progress
```

---

# 20. MANAGEMENT AREA

Create a management section.

Management should include:

## User Management

* List users
* Create user
* Edit user
* Activate/deactivate user
* Delete user

## Hiragana Management

* List
* Search
* Filter
* Create
* Edit
* Delete

## Katakana Management

Same functionality.

## Kanji Management

* Search
* Filter by JLPT
* Filter by lesson
* Create
* Edit
* Delete

## Vocabulary Management

* Search
* Filter by lesson
* Filter by category
* Create
* Edit
* Delete

Management operations must go through Express APIs.

---

# 21. FRONTEND ARCHITECTURE

Use jQuery for application behavior.

Avoid introducing React/Vue.

Create a small API abstraction:

```text
public/js/api.js
```

Example conceptual responsibility:

```text
api.users.*
api.vocabulary.*
api.kanji.*
api.learning.*
api.history.*
```

Pages should call API helpers rather than repeatedly writing raw AJAX requests.

---

# 22. FRONTEND RESPONSIBILITIES

Frontend handles:

* Rendering UI
* User interaction
* Flashcard animation
* Showing/hiding answers
* Calling APIs
* Form validation feedback
* Loading states
* Error messages
* Updating UI after API response

Frontend MUST NOT:

* Modify JSON
* Calculate authoritative learning progress
* Calculate authoritative review schedule
* Decide whether a card is mastered
* Duplicate backend business rules

---

# 23. BACKEND RESPONSIBILITIES

Backend handles:

* Validation
* User management
* Content management
* JSON persistence
* Learning state
* Review scheduling
* History
* Statistics
* Business rules

The backend is the source of truth.

---

# 24. JSON FILE SAFETY

Because JSON files replace a database, create a reusable JSON file utility.

It should handle:

* Read JSON
* Write JSON
* Ensure directory exists
* Handle missing file
* Handle invalid JSON
* Atomic/safe write where practical
* Prevent accidental data loss

Do not duplicate file read/write logic in every repository.

---

# 25. CONCURRENCY

The architecture must acknowledge that JSON is not a real database.

Assume:

* Small number of users
* Low concurrent writes
* Mostly local/self-hosted usage

Do not build distributed locking, queues, Redis, or database-level transaction systems.

However, avoid unsafe read-modify-write patterns where possible.

If two review requests happen almost simultaneously, the repository layer should minimize data corruption risk.

---

# 26. ERROR HANDLING

Create consistent API responses.

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

Define common error codes.

Do not expose filesystem paths or internal stack traces to the frontend.

---

# 27. VALIDATION

Validate all incoming API data.

Examples:

* Username required
* Username unique
* Content ID valid
* Content type valid
* Review result valid
* JLPT value valid
* Lesson valid

Do not trust frontend validation.

Backend validation is authoritative.

---

# 28. CURRENT USER

For the initial version, do NOT build authentication.

The frontend can maintain the selected user ID through:

```text
localStorage
```

Example:

```text
currentUserId = user_001
```

On application startup:

1. Read currentUserId.
2. Validate it through API.
3. If valid → open dashboard.
4. If invalid/missing → show user selection.

Allow switching user from the UI.

---

# 29. SECURITY SCOPE

This is a local/small-user learning application.

Do NOT over-engineer authentication.

However:

* Validate API input.
* Prevent path traversal.
* Never allow clients to specify arbitrary JSON file paths.
* Only server-side code may access the data directory.
* Sanitize user-generated values where necessary.
* Do not expose `/data` as static files.

---

# 30. ROUTING

Prefer a simple SPA-like experience or lightweight page-based architecture.

Do not introduce a frontend router library.

jQuery can load/update page sections.

Keep navigation simple.

---

# 31. DESIGN PRINCIPLES

Follow these principles:

### KISS

Keep everything as simple as possible.

### Separation of concerns

```text
Route
 ↓
Controller
 ↓
Service
 ↓
Repository
 ↓
JSON
```

### Single source of truth

Learning rules exist only in backend services.

### Stable IDs

Content and users use stable IDs.

### Content vs Progress separation

Never mix shared content with user-specific progress.

### No unnecessary abstractions

Do not create factories, dependency injection frameworks, CQRS, event buses, repositories for trivial in-memory operations, or other enterprise patterns unless clearly justified.

---

# 32. WHAT NOT TO BUILD

Do NOT implement:

* Authentication
* OAuth
* JWT
* MySQL
* MongoDB
* Redis
* WebSocket
* Microservices
* Docker orchestration
* Message queues
* CQRS
* Event sourcing
* Complex state management
* React
* Vue
* Next.js
* ORM
* External backend services

The application must remain small and understandable.

---

# 33. FUTURE EXTENSIBILITY

The architecture should make these future features possible without major rewrites:

* Spaced repetition
* JLPT filtering
* Minna no Nihongo lesson progression
* Favorite cards
* Daily goals
* Streaks
* Statistics
* Import/export JSON
* Backup/restore
* Multiple users
* More vocabulary sources
* Audio pronunciation
* Example sentences
* Quiz mode
* Typing mode
* Listening mode

Do not implement these now unless explicitly requested.

---

# 34. DOCUMENTATION REQUIRED

Before implementation, produce these architecture documents:

## 1. ARCHITECTURE.md

Explain:

* System architecture
* Folder structure
* Responsibilities
* Data flow
* Frontend/backend boundaries
* JSON persistence architecture

## 2. DATA_MODEL.md

Define:

* User model
* Hiragana model
* Katakana model
* Kanji model
* Vocabulary model
* Progress model
* History model
* Relationships between them

## 3. API.md

Define:

* Every API endpoint
* HTTP method
* Request parameters
* Request body
* Response
* Error cases

## 4. LEARNING_SYSTEM.md

Define:

* Learning states
* Review flow
* Correct/wrong behavior
* Review scheduling
* Progress calculation
* Future spaced repetition strategy

## 5. IMPLEMENTATION_PLAN.md

Break implementation into small sequential phases.

Each phase must be independently implementable and testable.

---

# 35. IMPLEMENTATION PHASES

The recommended phases are:

## Phase 1 — Project foundation

* Express
* Tailwind
* jQuery
* Basic server
* Static frontend
* JSON utility

## Phase 2 — User system

* users.json
* User API
* User selection
* Create user
* Current user

## Phase 3 — Content system

* Hiragana
* Katakana
* Kanji
* Vocabulary
* Content APIs

## Phase 4 — Flashcard UI

* Card component
* Show answer
* Next card
* Random card
* Content type selection

## Phase 5 — Learning progress

* Progress JSON
* Correct/wrong
* Learning states
* Review count

## Phase 6 — History

* Review history
* History API
* History page

## Phase 7 — Dashboard

* Statistics
* Progress
* Daily review
* Streak

## Phase 8 — Management

* User management
* Content management
* Search
* Filters
* CRUD

## Phase 9 — Review system

* Cards due for review
* Next review time
* Simple spaced repetition

## Phase 10 — Polish

* Responsive UI
* Loading states
* Error handling
* Empty states
* Backup/export
* Code cleanup

Each phase must be small enough for an AI coding agent to implement safely.

---

# 36. IMPORTANT AI IMPLEMENTATION RULES

When another AI agent implements this architecture:

1. Read all architecture documents first.
2. Do not modify architecture without explaining why.
3. Do not introduce new libraries without justification.
4. Do not replace JSON with a database.
5. Do not introduce React/Vue.
6. Do not put business logic into routes.
7. Do not put business logic into jQuery.
8. Do not duplicate JSON read/write logic.
9. Do not mix user progress with shared content.
10. Do not implement future features prematurely.
11. Complete and test one phase before moving to the next.
12. Keep changes small and reviewable.
13. Preserve existing data when updating JSON.
14. Never silently delete user learning history.
15. Prefer backward-compatible JSON structures.

---

# 37. FINAL ARCHITECTURE GOAL

The final system should conceptually look like:

```text
                         Browser
                            │
                    HTML / Tailwind
                            │
                          jQuery
                            │
                         REST API
                            │
                     ┌──────▼──────┐
                     │   Express   │
                     └──────┬──────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
          Controller     Service      Validation
                            │
                ┌───────────┼───────────┐
                │           │           │
             Content     Learning     History
                │           │           │
                └───────────┼───────────┘
                            │
                       Repository
                            │
                       JSON Service
                            │
              ┌─────────────┼─────────────┐
              │             │             │
           Content        Users        Learning
           JSON           JSON          JSON
```

The most important architectural rule is:

> **Content describes what the user learns. Learning data describes how a specific user learns it.**

Keep those two concepts completely separate.

The application should remain simple enough that a single developer can understand the entire codebase without needing to understand enterprise architecture.
