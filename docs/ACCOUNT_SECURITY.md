# Learner account security and recovery gate (2026-11-12)

## Implemented: authenticated password change

- Learner must already have a valid revocable session and know the **current password**.
- POST /api/v1/auth/learner/password accepts currentPassword, newPassword,
  repeatPassword. All password fields are validated server-side; new passwords
  must be 12–256 characters, match confirmation and differ from the old one.
- The original credential is checked with the existing salted scrypt verifier
  and per-account SQLite login lockout. Wrong current passwords count against
  the same lockout limit as learner login.
- The route checks Origin (CSRF protection), rejects unauthenticated users and
  Admin cookies, and has a per-socket-IP limit of 10 attempts / 15 minutes.
- Password update and revocation of **all auth_sessions for this learner** occur
  in one SQLite transaction. Once committed, the current browser receives
  a new signed cookie with a new session record. Previously copied cookies
  and sessions from other devices cannot be reused.
- If cookie reissuance fails after the password transaction, the credential
  remains updated and all old sessions remain revoked (fail closed); log in
  again with the new password.
- The React route /account/security is shown only to authenticated learners.
  It does not show credentials, password hashes, or SRS history.
- This workflow never resets review scheduling, guest learning, or existing
  user IDs. It remains functional when public signup is disabled.

## Not implemented: unauthenticated password reset

A "forgot password" link must **not** let someone claim an account by username,
display name, SRS data, or possession of a guest cookie. This service currently
does not collect verified email or phone ownership evidence.

Prior to offering recovery, design an independent enrollment and verification
workflow (for example, verified email with single-use, short-lived grants, rate
limits, one-way hashed reset tokens, revocation, and a private delivery channel),
then review audit and abuse controls. Do not expose a manual unauthenticated
Admin password-setting endpoint. User records from Express v1 have no password
identity proof; their migration remains gated in V1_ACCOUNT_SRS_MIGRATION.md.

## Verification

Tests on isolated temporary SQLite verify that old/current/new passwords behave
as expected, both sessions from other devices are revoked, CSRF and role checks
are enforced, and study tables are not changed. Real production users and v1
identities were not accessed, linked or modified.

## Operational notes

For real deployment: take a verified SQLite backup, apply reviewed migrations
and run browser/HTTP smoke tests in staging. Existing v2 auth sessions remain
valid across this code-only change; they are invalidated per account only after
that account changes password. The earlier 006 migration already invalidated
pre-006 stateless auth cookies.
