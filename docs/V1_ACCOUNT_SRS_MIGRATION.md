# Legacy v1 user/SRS migration — not implemented in MySQL-only Nihon

The previous Fastify proof of concept had a read-only SQLite audit helper
and SQLite staging imports. Those utilities have been **removed** from
the MySQL-only application. They must not be run against MySQL data.

Before any v1 identity or SRS import is attempted:
1. Obtain a verified immutable v1 data snapshot from its owner. The
   currently inspected development machine did not have a verified v1
   app.db source database.
2. Establish trustworthy mappings from original user identities to
   newly created MySQL learner identities. Username resemblance does not
   constitute proof. No automatic reassignment is allowed.
3. Design a dedicated, reviewed **offline** v1-to-MySQL migration and
   reconcile user/card/review counts on isolated staging data.
4. Preserve originals, acquire explicit approval, and define a rollback
   or recovery procedure before any production cutover.

The main Nihon MySQL application will **not** read or create a SQLite
database, and it does not import v1 users or progress automatically.
See docs/SECURITY_CREDENTIAL_EXPOSURE.md before handling legacy
production credentials and docs/UI_FIRST_INSTALL.md for clean installs.
