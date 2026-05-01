CREATE TABLE IF NOT EXISTS test_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  practice_test_id       UUID NOT NULL REFERENCES practice_tests(id),
  started_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at           TIMESTAMPTZ,
  time_remaining_seconds INTEGER,
  percent_correct        NUMERIC(5, 2),
  status                 TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'submitted', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user   ON test_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_test   ON test_sessions(practice_test_id, status);
