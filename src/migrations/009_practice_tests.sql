CREATE TABLE IF NOT EXISTS practice_tests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id        UUID REFERENCES modules(id) ON DELETE SET NULL,
  lesson_id        UUID REFERENCES lessons(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  duration_minutes SMALLINT NOT NULL DEFAULT 90,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS passages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_test_id UUID NOT NULL REFERENCES practice_tests(id) ON DELETE CASCADE,
  content          TEXT NOT NULL,
  sort_order       SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_test_id UUID NOT NULL REFERENCES practice_tests(id) ON DELETE CASCADE,
  passage_id       UUID REFERENCES passages(id) ON DELETE SET NULL,
  stem             TEXT NOT NULL,
  option_a         TEXT NOT NULL,
  option_b         TEXT NOT NULL,
  option_c         TEXT NOT NULL,
  option_d         TEXT NOT NULL,
  correct_option   CHAR(1) NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
  topic_tag        TEXT,
  sort_order       SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_questions_test    ON questions(practice_test_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_questions_passage ON questions(passage_id);
