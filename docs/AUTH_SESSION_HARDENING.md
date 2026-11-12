# Auth session hardening — SQLite-backed revocation

Effective with migration 006_auth_sessions.sql:

- A signed, HttpOnly browser session also has a corresponding SQLite row. Only a SHA-256 digest of the signed cookie is stored; the raw token stays in the browser cookie and never appears in the DB.
- Each login uses an independent random 24-byte session nonce and rotates the prior session from the same browser.
- Logout deletes that session row before clearing the cookie. Replaying the old signed token is denied, including after a process restart. Disabling a learner continues to block their active sessions.
- Authenticated requests do a single indexed SQLite lookup, with no write per request. Expired rows are pruned on login (no worker, cache, Redis, cron, or second process).
- Admin sessions remain 8 hours; learner sessions remain 30 days. CSRF rules and REST integration Bearer tokens do not change.
- **One-time compatibility break:** Existing pre-migration stateless v1 authentication cookies are no longer accepted. Admin and learner users need to log in again after migration. This does not touch guest sessions, user data or SRS.

Safety boundaries: this is a development-only change on the Fastify branch. Migrations are verified against isolated test SQLite files; no production cutover or v1 database modification is authorized. Account recovery and remote MCP OAuth remain pending.
