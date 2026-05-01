const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { jwtSecret, jwtExpiresIn } = require('../config/env');
const { validateCode } = require('./inviteCodeService');

const SALT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
}

function safeUser(user) {
  const { password_hash, deleted_at, ...rest } = user;
  return rest;
}

async function register({ code, name, email, password }) {
  // 1. Validate invite code (read-only first)
  const invite = await validateCode(code);
  if (!invite) {
    const err = new Error('Invalid, expired, or already-used invite code');
    err.status = 400;
    throw err;
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // 3. Insert user (email uniqueness enforced by DB)
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, cohort_id)
     VALUES ($1, $2, $3, 'student', $4)
     RETURNING *`,
    [name.trim(), email.toLowerCase().trim(), passwordHash, invite.cohort_id]
  );

  // 4. Consume invite code (atomic)
  const consumed = await validateCode(code, { userId: user.id, consume: true });
  if (!consumed) {
    // Race condition — another registration used it first; roll back user
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    const err = new Error('Invite code was just used by another registration. Please request a new one.');
    err.status = 409;
    throw err;
  }

  const token = signToken(user);
  return { token, user: safeUser(user) };
}

async function login({ email, password }) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase().trim()]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }

  await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [user.id]);

  const token = signToken(user);
  return { token, user: safeUser(user) };
}

module.exports = { register, login, safeUser };
