CREATE TABLE IF NOT EXISTS cohorts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD CONSTRAINT IF NOT EXISTS fk_users_cohort
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL;
