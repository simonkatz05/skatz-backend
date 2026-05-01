const pool = require('../config/db');

/**
 * Atomically replaces the module access set for a cohort.
 * moduleIds: string[] of UUID
 */
async function setCohortModules(cohortId, moduleIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cohort_module_access WHERE cohort_id = $1', [cohortId]);

    if (moduleIds.length > 0) {
      const values = moduleIds.map((id, i) => `($1, $${i + 2})`).join(', ');
      await client.query(
        `INSERT INTO cohort_module_access (cohort_id, module_id) VALUES ${values}`,
        [cohortId, ...moduleIds]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function grantModule(cohortId, moduleId) {
  await pool.query(
    `INSERT INTO cohort_module_access (cohort_id, module_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [cohortId, moduleId]
  );
}

async function revokeModule(cohortId, moduleId) {
  await pool.query(
    'DELETE FROM cohort_module_access WHERE cohort_id = $1 AND module_id = $2',
    [cohortId, moduleId]
  );
}

async function getCohortModules(cohortId) {
  const { rows } = await pool.query(
    `SELECT m.id, m.title, m.description, m.sort_order, cma.unlocked_at
     FROM modules m
     JOIN cohort_module_access cma ON cma.module_id = m.id
     WHERE cma.cohort_id = $1
     ORDER BY m.sort_order`,
    [cohortId]
  );
  return rows;
}

/**
 * Returns the full matrix: all modules × all cohorts with a boolean granted flag.
 */
async function getAccessMatrix() {
  const { rows: modules } = await pool.query('SELECT id, title, sort_order FROM modules ORDER BY sort_order');
  const { rows: cohorts } = await pool.query('SELECT id, name FROM cohorts ORDER BY name');
  const { rows: access } = await pool.query('SELECT cohort_id, module_id FROM cohort_module_access');

  const granted = new Set(access.map(r => `${r.cohort_id}:${r.module_id}`));

  return {
    modules,
    cohorts,
    matrix: modules.map(m => ({
      module: m,
      access: cohorts.map(c => ({
        cohort: c,
        granted: granted.has(`${c.id}:${m.id}`),
      })),
    })),
  };
}

module.exports = { setCohortModules, grantModule, revokeModule, getCohortModules, getAccessMatrix };
