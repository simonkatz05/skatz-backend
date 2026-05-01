CREATE TABLE IF NOT EXISTS card_reviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flashcard_id   UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  ease_factor    NUMERIC(5, 4) NOT NULL DEFAULT 2.5,
  interval_days  INTEGER NOT NULL DEFAULT 1,
  repetitions    INTEGER NOT NULL DEFAULT 0,
  due_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  last_reviewed  TIMESTAMPTZ,
  UNIQUE (user_id, flashcard_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_due ON card_reviews(user_id, due_date);
