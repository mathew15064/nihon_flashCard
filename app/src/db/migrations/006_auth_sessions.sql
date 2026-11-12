-- Store only hashes of signed cookie tokens, never raw bearer credentials.
-- A successful login creates a record and logout revokes it server-side.
-- Existing stateless v1 cookies are intentionally invalidated at upgrade.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);
