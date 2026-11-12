-- UI-managed configuration; API keys and MCP tokens are AES-256-GCM ciphertext.
-- No plaintext access tokens or provider credentials may be stored here.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
