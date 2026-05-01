const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const pool = require('../config/db');

/**
 * Returns Express middleware that verifies JWT and optionally enforces roles.
 * Usage: requireAuth() — any authenticated user
 *        requireAuth(['admin']) — admin only
 */
function requireAuth(roles = []) {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, name, role, cohort_id, test_date, goal_score FROM users WHERE id = $1 AND deleted_at IS NULL',
      [payload.sub]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = rows[0];

    if (roles.length > 0 && !roles.includes(user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.user = user;
    next();
  };
}

module.exports = requireAuth;
