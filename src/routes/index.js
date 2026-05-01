const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const pool = require('../config/db');

router.use('/auth', require('./auth/authRoutes'));
router.use('/modules', require('./modules/moduleRoutes'));
router.use('/decks', require('./flashcards/flashcardRoutes'));
router.use('/practice-tests', require('./practiceTests/practiceTestRoutes'));
router.use('/classes', require('./classes/classRoutes'));
router.use('/admin', require('./admin/adminRoutes'));

// GET /api/v1/dashboard — aggregated KPIs for the student home screen
router.get('/dashboard', requireAuth(), async (req, res) => {
  const userId = req.user.id;

  // Study streak: consecutive days with at least one card review
  const { rows: [streakRow] } = await pool.query(
    `WITH daily AS (
       SELECT DATE(last_reviewed) AS day
       FROM card_reviews
       WHERE user_id = $1 AND last_reviewed IS NOT NULL
       GROUP BY DATE(last_reviewed)
       ORDER BY day DESC
     ),
     streak AS (
       SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day DESC))::int AS grp
       FROM daily
     )
     SELECT COUNT(*)::int AS streak
     FROM streak
     WHERE grp = (SELECT grp FROM streak ORDER BY day DESC LIMIT 1)`,
    [userId]
  );

  // Cards due today
  const { rows: [dueRow] } = await pool.query(
    `SELECT COUNT(*)::int AS due
     FROM card_reviews
     WHERE user_id = $1 AND due_date <= CURRENT_DATE`,
    [userId]
  );

  // Last practice test score
  const { rows: [lastScore] } = await pool.query(
    `SELECT ts.percent_correct, pt.title, ts.submitted_at
     FROM test_sessions ts
     JOIN practice_tests pt ON pt.id = ts.practice_test_id
     WHERE ts.user_id = $1 AND ts.status = 'submitted'
     ORDER BY ts.submitted_at DESC LIMIT 1`,
    [userId]
  );

  // Next upcoming class
  const { rows: [nextClass] } = await pool.query(
    `SELECT cl.id, cl.title, cl.scheduled_at, cl.meeting_url
     FROM classes cl
     WHERE (cl.cohort_id = $2 OR cl.cohort_id IS NULL)
       AND cl.scheduled_at > NOW()
     ORDER BY cl.scheduled_at ASC LIMIT 1`,
    [userId, req.user.cohort_id]
  );

  // Modules progress summary
  const { rows: modulesSummary } = await pool.query(
    `SELECT m.id, m.title,
            COUNT(l.id)::int AS total_lessons,
            COUNT(slp.id)::int AS completed_lessons
     FROM modules m
     JOIN cohort_module_access cma ON cma.module_id = m.id AND cma.cohort_id = $2
     LEFT JOIN lessons l ON l.module_id = m.id
     LEFT JOIN student_lesson_progress slp ON slp.lesson_id = l.id AND slp.user_id = $1
     GROUP BY m.id
     ORDER BY m.sort_order`,
    [userId, req.user.cohort_id]
  );

  // Score trajectory (last 10 submitted sessions)
  const { rows: scoreHistory } = await pool.query(
    `SELECT ts.percent_correct, ts.submitted_at, pt.title
     FROM test_sessions ts
     JOIN practice_tests pt ON pt.id = ts.practice_test_id
     WHERE ts.user_id = $1 AND ts.status = 'submitted'
     ORDER BY ts.submitted_at ASC`,
    [userId]
  );

  res.json({
    streak: streakRow?.streak ?? 0,
    cardsDueToday: dueRow?.due ?? 0,
    lastPracticeScore: lastScore || null,
    nextClass: nextClass || null,
    modules: modulesSummary,
    scoreHistory,
  });
});

module.exports = router;
