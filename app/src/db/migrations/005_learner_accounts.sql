-- Auth.js credential accounts for learners; Admin is configured separately via environment.
CREATE TABLE IF NOT EXISTS learner_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learner_accounts_status ON learner_accounts(status);

-- Persistent login lockout by account name. Development-grade brute force protection.
CREATE TABLE IF NOT EXISTS learner_login_limits (
  username_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learner_locked_until ON learner_login_limits(locked_until);

-- Local signups are opt-in and capped within a rolling hour.
CREATE TABLE IF NOT EXISTS learner_signup_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_signup_events_time ON learner_signup_events(created_at);

-- Guest-to-learner SRS transfer requires an authenticated explicit action.
CREATE TABLE IF NOT EXISTS guest_account_merges (
  guest_user_id TEXT PRIMARY KEY,
  learner_user_id TEXT NOT NULL,
  merged_at TEXT NOT NULL
);
