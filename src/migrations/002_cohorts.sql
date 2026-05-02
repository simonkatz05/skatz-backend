-- Drop and recreate to recover from any prior partial run that left cohorts
-- in an inconsistent state. Safe on a fresh DB (no real data yet).
DROP TABLE IF EXISTS cohorts CASCADE;

CREATE TABLE cohorts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  start_date DATE,
  end_date   DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure no stale constraint survives the cascade before re-adding.
ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_cohort;

ALTER TABLE users
  ADD CONSTRAINT fk_users_cohort
  FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL;
