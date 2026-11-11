# Architecture decision — Fastify + React + Vite

Nihon now targets one Fastify HTTP process for REST, MCP, AI, authentication
and the React SPA. React is built with Vite to static assets for production.
Node.js v22 + SQLite + Drizzle remains the shared domain/storage stack.

The new implementation lives in app/ in branch feat/fastify-vite-monolith,
created from origin/main in a separate Git worktree. The original Express
project is retained as a migration reference only. The previous Next.js v2
branch/worktree remains intact, including its uncommitted learner-account work.
No old source, database or running production installation has been replaced.

## Domain logic preserved
- Vocabulary search, Japanese normalized key and multilingual meanings.
- Draft review and publishing, private/public vocabulary decks.
- Admin-managed OpenAI generation, structured outputs, candidate review.
- MCP tool access to search/read/create draft vocabulary.
- The six-step legacy SRS algorithm and retry-safe review events.
- Guest sessions, password-based learner accounts and explicit guest transfer.
- SQLite schema migrations and verified read-only legacy vocabulary imports.

## Frontend/backend mapping
- Next.js Server Actions / Route Handlers -> Fastify REST handlers.
- NextAuth -> Fastify server-side authentication and signed cookies.
- Next.js frontend -> React SPA with Vite build (no runtime SSR).
- Next.js MCP handler -> official MCP SDK mounted in Fastify.
- Drizzle, SQLite and domain services -> reused.
- In development Vite middleware runs inside the Fastify server.
- In production only the built static React files are served by Fastify.

## Resource observations on local PC
A Docker smoke container, at idle after startup migrations and no user traffic,
was measured at about 50 MiB. A local production Node process after API and
MCP smoke tests was about 114 MB RSS. These figures are not a same-load
comparison with Next.js, and not production capacity guarantees.

## Safety boundaries
- No mutation of v1 data/app.db or original learning progress.
- New app uses isolated app/data/nihon.sqlite (ignored by Git).
- Database vocabulary import defaults to dry-run and backs up its target
  before apply. Exact source JSON and ID mappings are retained.
- Legacy v1 usernames have no password proof and cannot be automatically
  attached to newly registered accounts with the same name.
- Production requires HTTPS, secrets, login rate limiting/recovery, MCP OAuth,
  audit/monitoring, live AI model testing, backup/restore and rollback drill.

## Cutover steps before replacing v1
1. Audit Admin and learner authorization plus API/MCP scopes.
2. Review data migration and account ownership evidence.
3. Reconcile vocabulary/progress and historical review counts.
4. Verify backup/restore and rolling back a deployment.
5. Test AI spending controls and real generation quality.
6. Measure resource use under realistic datasets and users.
7. Deploy a single Fastify container, disable Express runtime and maintain
   a rollback window.

This branch is a development implementation, not approval to deploy or merge.
