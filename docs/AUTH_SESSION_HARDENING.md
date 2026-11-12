# MySQL-backed revocable browser sessions

Nihon signs HttpOnly SameSite cookies and stores SHA-256 digests
in MySQL auth_sessions, never plaintext browser tokens. Every
authenticated request checks the signed cookie and corresponding MySQL
record. Login rotates sessions; logout deletes the record. Password
change revokes the learner's sessions in one database transaction,
then issues a new current-browser session.

Admin sessions expire after 8 hours and learner sessions after 30 days.
No second session store or SQLite driver is used. Cookie authentication
requires same-origin checks for mutations. External Admin integrations
use scoped server-only Bearer tokens where supported.

The MySQL-only startup requires the persistent instance-secret.key to
validate cookies. Data at rest is protected by MySQL access controls,
not by exposing session hashes to the browser.
