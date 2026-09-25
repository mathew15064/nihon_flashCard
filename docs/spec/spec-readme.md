> Original specification. Superseded by docs/README.md and
> docs/ARCHITECTURE.md. Kept for historical reference.

# 🇯🇵 Japanese Flashcard

A lightweight Japanese language learning and flashcard web application.

The application is designed for personal or small-group usage and uses **JSON files as the entire persistence layer**.

---

# 1. QUICK PROJECT OVERVIEW

The application supports:

* Multiple local users
* Hiragana
* Katakana
* Kanji
* Minna no Nihongo vocabulary
* Flashcard learning
* Learning progress
* Review history
* Review scheduling
* Statistics
* Search
* Filtering
* Management pages

Technology:

```text
Backend
→ Node.js
→ Express.js

Frontend
→ HTML
→ Tailwind CSS
→ jQuery

Storage
→ JSON files
```

There is intentionally **no database**.

---

# 2. IMPORTANT — READ THESE FILES FIRST

Before modifying the project, every AI agent MUST read:

```text
README.md
ARCHITECTURE.md
OVERFLOW.md
```

Reading order:

```text
README.md
    ↓
ARCHITECTURE.md
    ↓
OVERFLOW.md
    ↓
Relevant source code
```

#> Original specification. Superseded by /README.md
# README.md

This file explains:

* What the project is
* Where the important documentation lives
* Basic project structure
* Rules for AI agents

## ARCHITECTURE.md

This file explains:

* System architecture
* Folder structure
* Data architecture
* API architecture
* Frontend/backend responsibilities
* Learning architecture

## OVERFLOW.md

This file explains:

* Current project state
* Current implementation progress
* Current tasks
* Known problems
* Recent changes
* Architectural decisions
* Pending work
* Important context for the next AI agent

`OVERFLOW.md` is a living project context document.

---

# 3. AI AGENT STARTUP PROTOCOL

Every AI agent entering this project MUST perform the following:

### Step 1

Read:

```text
README.md
```

### Step 2

Read:

```text
ARCHITECTURE.md
```

### Step 3

Read:

```text
OVERFLOW.md
```

### Step 4

Inspect the current source code relevant to the task.

### Step 5

Compare the implementation against the architecture and current project state.

### Step 6

Before making large changes:

* Identify existing functionality.
* Reuse existing code.
* Avoid duplicate files.
* Avoid duplicate APIs.
* Avoid duplicate business logic.

### Step 7

Implement only the requested scope.

### Step 8

Test the affected functionality.

### Step 9

Update `OVERFLOW.md` with the result.

---

# 4. PROJECT STRUCTURE

The root structure is intentionally simple:

```text
japanese-flashcard/
│
├── README.md
├── ARCHITECTURE.md
├── OVERFLOW.md
├── package.json
│
├── server/
│
├── public/
│
└── data/
```

---

# 5. CORE ARCHITECTURE

```text
Browser
    ↓
HTML + Tailwind CSS + jQuery
    ↓
REST API
    ↓
Express.js
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
JSON Files
```

The frontend MUST NOT directly access JSON files.

---

# 6. DATA ARCHITECTURE

Shared Japanese content:

```text
data/content/
├── hiragana.json
├── katakana.json
├── kanji.json
└── vocabulary.json
```

Users:

```text
data/users.json
```

User learning data:

```text
data/learning/users/{userId}/
├── progress.json
└── history/
    └── YYYY-MM.json
```

Shared content and user-specific learning data MUST remain separate.

---

# 7. MAIN USER FLOW

```text
Open Application
        ↓
User Selection
   ┌────┴────┐
   ↓         ↓
Existing   New User
   ↓         ↓
   └────┬────┘
        ↓
    Dashboard
        ↓
 ┌──────┼────────┐
 ↓      ↓        ↓
Learn  Review  History
 ↓      ↓        ↓
 └──────┼────────┘
        ↓
     Progress
```

---

# 8. MAIN FEATURES

## Users

* Select user
* Create user
* Edit user
* Switch user
* Activate/deactivate user

## Learning

* Hiragana
* Katakana
* Kanji
* Vocabulary

## Flashcards

* Question
* Answer
* Correct
* Wrong
* Next card
* Random cards

## Progress

* Learned
* Learning
* Review
* Mastered

## History

* Review history
* Correct/wrong history
* Review dates

## Management

* User management
* Content management
* Search
* Filters
* CRUD

---

# 9. IMPORTANT PROJECT RULES

Do NOT introduce:

* MySQL
* PostgreSQL
* MongoDB
* SQLite
* Redis
* React
* Vue
* Next.js
* ORM
* GraphQL
* WebSocket
* Microservices
* CQRS
* Event sourcing
* Message queues

unless explicitly approved by the project owner.

---

# 10. DEVELOPMENT PRINCIPLES

Prefer:

```text
Simple
Clear
Maintainable
Small
Reliable
```

Avoid:

```text
Over-engineering
Premature optimization
Unnecessary abstraction
Duplicate logic
Duplicate data
```

The goal is a useful Japanese learning application, not an enterprise platform.

---

# 11. DOCUMENTATION RESPONSIBILITY

When an important architectural decision changes:

Update:

```text
ARCHITECTURE.md
```

When project state changes:

Update:

```text
OVERFLOW.md
```

When project setup or developer usage changes:

Update:

```text
README.md
```

Do not let these documents become stale.

---

# 12. CURRENT PROJECT STATE

The authoritative current project state is maintained in:

```text
OVERFLOW.md
```

Agents MUST NOT assume that the architecture documentation represents the exact current implementation.

`ARCHITECTURE.md` describes the intended architecture.

`OVERFLOW.md` describes the actual current state.

If they conflict:

1. Identify the conflict.
2. Do not silently overwrite either document.
3. Determine whether the implementation or architecture should change.
4. Update the appropriate documentation.

---

# 13. PROJECT DOCUMENTATION MAP

```text
README.md
│
├── What is this project?
├── How to enter the project
└── Where to find detailed information
        │
        ├───────────────┐
        ↓               ↓
ARCHITECTURE.md    OVERFLOW.md
│                  │
│                  ├── Current State
│                  ├── Progress
│                  ├── Tasks
│                  ├── Issues
│                  └── Change Log
│
├── Architecture
├── Data Model
├── API
└── Technical Rules
```

---

# 14. FINAL RULE FOR AI AGENTS

Before coding:

```text
READ README.md
READ ARCHITECTURE.md
READ OVERFLOW.md
UNDERSTAND CURRENT STATE
THEN CODE
```

After coding:

```text
TEST
UPDATE OVERFLOW.md
RECORD IMPORTANT CHANGES
```

Never assume another AI agent knows the previous conversation.

The repository documentation is the persistent project memory.
