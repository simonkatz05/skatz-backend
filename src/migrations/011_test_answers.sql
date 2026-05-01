CREATE TABLE IF NOT EXISTS test_answers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  question_id    UUID NOT NULL REFERENCES questions(id),
  chosen_option  CHAR(1) CHECK (chosen_option IN ('A', 'B', 'C', 'D')),
  is_flagged     BOOLEAN NOT NULL DEFAULT FALSE,
  is_correct     BOOLEAN,
  answered_at    TIMESTAMPTZ,
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answers_session ON test_answers(session_id);
