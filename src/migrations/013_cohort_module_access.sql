CREATE TABLE IF NOT EXISTS cohort_module_access (
  cohort_id   UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
  module_id   UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cohort_id, module_id)
);
