CREATE TABLE IF NOT EXISTS flashcards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id      UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  front        TEXT NOT NULL,
  back         TEXT NOT NULL,
  anki_note_id BIGINT,
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcards_deck_note
  ON flashcards(deck_id, anki_note_id) WHERE anki_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flashcards_deck ON flashcards(deck_id, sort_order);
