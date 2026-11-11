-- Extend the existing v2 review state without rewriting old cards.
-- "new" cards use next_review_at NULL and become due immediately after enrollment.
ALTER TABLE review_cards ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_cards ADD COLUMN times_reviewed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_cards ADD COLUMN correct_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_cards ADD COLUMN wrong_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE review_cards ADD COLUMN last_reviewed_at TEXT;

-- A client-generated review request ID makes retries safe after network errors.
ALTER TABLE review_events ADD COLUMN request_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_request ON review_events(request_id);
CREATE INDEX IF NOT EXISTS idx_review_cards_user_due ON review_cards(user_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_review_events_reviewed ON review_events(reviewed_at);

-- Track explicitly joined decks. Learned cards remain shared across decks.
CREATE TABLE IF NOT EXISTS user_deck_enrollments (
  user_id TEXT NOT NULL,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE RESTRICT,
  enrolled_at TEXT NOT NULL,
  PRIMARY KEY(user_id, deck_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON user_deck_enrollments(user_id);
