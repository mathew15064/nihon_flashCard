# Learner account security — MySQL

Learner accounts, salted password hashes, account-level login lockouts
and revocable auth sessions are stored exclusively in MySQL tables.

Logged-in learners can change passwords at /account/security by proving
their current password, submitting a distinct new password of 12–256
characters, and passing the normal same-origin/CSRF checks. The service
updates the MySQL password verifier and revokes all existing learner
sessions inside one MySQL transaction, then issues a new cookie to the
current browser.

There is no unverified email/phone recovery flow and no automated v1
account mapping. All account operations rely on MySQL, never a local
SQLite database. See docs/TESTING.md for MySQL integration coverage.
