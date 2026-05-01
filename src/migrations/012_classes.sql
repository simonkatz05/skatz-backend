CREATE TABLE IF NOT EXISTS classes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id        UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  scheduled_at     TIMESTAMPTZ,
  duration_minutes SMALLINT,
  meeting_url      TEXT,
  recording_url    TEXT,
  status           TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'ended', 'cancelled')),
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classes_cohort    ON classes(cohort_id);
CREATE INDEX IF NOT EXISTS idx_classes_scheduled ON classes(scheduled_at);
