const router = require('express').Router();
const { register, login } = require('../../services/authService');
const { validateCode } = require('../../services/inviteCodeService');
const requireAuth = require('../../middleware/auth');
const validate = require('../../middleware/validate');

// POST /api/v1/auth/verify-invite — check a code without consuming it
router.post('/verify-invite', validate({
  code: { required: true, type: 'string' },
}), async (req, res) => {
  const invite = await validateCode(req.body.code);
  if (!invite) return res.status(400).json({ error: 'Invalid, expired, or already-used invite code' });
  res.json({ valid: true, cohortId: invite.cohort_id });
});

// POST /api/v1/auth/register
router.post('/register', validate({
  code:     { required: true,  type: 'string' },
  name:     { required: true,  type: 'string', maxLength: 100 },
  email:    { required: true,  type: 'string', maxLength: 255 },
  password: { required: true,  type: 'string', maxLength: 128 },
}), async (req, res) => {
  const { code, name, email, password } = req.body;
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const result = await register({ code, name, email, password });
  res.status(201).json(result);
});

// POST /api/v1/auth/login
router.post('/login', validate({
  email:    { required: true, type: 'string' },
  password: { required: true, type: 'string' },
}), async (req, res) => {
  const result = await login({ email: req.body.email, password: req.body.password });
  res.json(result);
});

// GET /api/v1/auth/me
router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
