const { randomBytes } = require('crypto');
const pool = require('../config/db');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `SKZ-${rand(4)}-${rand(4)}`;
}

async function generateCodes({ cohortId, count = 10, expiresAt, createdBy }) {
  const codes = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;
      do {
        code = generateCode();
        attempts++;
        if (attempts > 20) throw new Error('Could not generate unique invite code');
      } while (codes.some(c => c.code === code));

      const { rows } = await client.query(
        `INSERT INTO invite_codes (code, cohort_id, created_by, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING
         RETURNING *`,
        [code, cohortId || null, createdBy, expiresAt || null]
      );
      if (rows[0]) codes.push(rows[0]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return codes;
}

/**
 * Atomically validates and optionally consumes an invite code.
 * Returns the invite_codes row, or null if invalid/expired/used.
 * Pass consume=true on registration to mark it used.
 */
async function validateCode(code, { userId = null, consume = false } = {}) {
  const normalized = code.trim().toUpperCase();

  if (consume && userId) {
    const { rows, rowCount } = await pool.query(
      `UPDATE invite_codes
       SET used_by = $1, used_at = NOW()
       WHERE code = $2
         AND used_by IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING *`,
      [userId, normalized]
    );
    return rowCount > 0 ? rows[0] : null;
  }

  // Read-only validation
  const { rows } = await pool.query(
    `SELECT * FROM invite_codes
     WHERE code = $1
       AND used_by IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [normalized]
  );
  return rows[0] || null;
}

module.exports = { generateCodes, validateCode };
