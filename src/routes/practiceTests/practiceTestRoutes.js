const router = require('express').Router();
const requireAuth = require('../../middleware/auth');
const pool = require('../../config/db');
const {
  startSession, getSession, saveAnswers, submitSession, getResults,
} = require('../../services/practiceTestService');

// GET /practice-tests — accessible tests
router.get('/', requireAuth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT pt.id, pt.title, pt.duration_minutes, pt.module_id, pt.lesson_id,
            COUNT(q.id)::int AS question_count,
            ts.id AS last_session_id, ts.status AS last_session_status, ts.percent_correct
     FROM practice_tests pt
     LEFT JOIN questions q ON q.practice_test_id = pt.id
     LEFT JOIN LATERAL (
       SELECT id, status, percent_correct FROM test_sessions
       WHERE user_id = $1 AND practice_test_id = pt.id
       ORDER BY started_at DESC LIMIT 1
     ) ts ON true
     WHERE pt.lesson_id IS NULL
        OR EXISTS (
          SELECT 1 FROM student_lesson_progress slp
          WHERE slp.user_id = $1 AND slp.lesson_id = pt.lesson_id
        )
     GROUP BY pt.id, ts.id, ts.status, ts.percent_correct
     ORDER BY pt.created_at`,
    [req.user.id]
  );
  res.json({ practiceTests: rows });
});

// POST /practice-tests/:id/sessions — start a new session
router.post('/:id/sessions', requireAuth(), async (req, res) => {
  const result = await startSession(req.user.id, req.params.id);
  res.status(201).json(result);
});

// GET /practice-tests/sessions/:sessionId — resume
router.get('/sessions/:sessionId', requireAuth(), async (req, res) => {
  const result = await getSession(req.params.sessionId, req.user.id);
  res.json(result);
});

// PUT /practice-tests/sessions/:sessionId/answers — auto-save
router.put('/sessions/:sessionId/answers', requireAuth(), async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers must be an array' });
  await saveAnswers(req.params.sessionId, req.user.id, answers);
  res.json({ ok: true });
});

// POST /practice-tests/sessions/:sessionId/submit — final submit
router.post('/sessions/:sessionId/submit', requireAuth(), async (req, res) => {
  const results = await submitSession(req.params.sessionId, req.user.id);
  res.json(results);
});

// GET /practice-tests/sessions/:sessionId/results
router.get('/sessions/:sessionId/results', requireAuth(), async (req, res) => {
  const results = await getResults(req.params.sessionId, req.user.id);
  res.json(results);
});

module.exports = router;
