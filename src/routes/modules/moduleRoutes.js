const router = require('express').Router();
const requireAuth = require('../../middleware/auth');
const pool = require('../../config/db');
const { getStudentModules, getLessonAccessState, getUnlocksAfterLessonComplete } = require('../../services/gatingService');

// GET /modules — cohort-accessible modules with lesson progress
router.get('/', requireAuth(), async (req, res) => {
  const modules = await getStudentModules(req.user.id);
  res.json({ modules });
});

// GET /modules/:id/lessons — lessons with unlock + completion state
router.get('/:id/lessons', requireAuth(), async (req, res) => {
  const { rows: lessons } = await pool.query(
    `SELECT l.id, l.title, l.content_type, l.sort_order,
            CASE WHEN slp.user_id IS NOT NULL THEN true ELSE false END AS completed,
            fd.id AS deck_id, fd.title AS deck_title,
            pt.id AS practice_test_id, pt.title AS practice_test_title
     FROM lessons l
     LEFT JOIN student_lesson_progress slp ON slp.lesson_id = l.id AND slp.user_id = $1
     LEFT JOIN flashcard_decks fd ON fd.lesson_id = l.id
     LEFT JOIN practice_tests pt ON pt.lesson_id = l.id
     WHERE l.module_id = $2
     ORDER BY l.sort_order`,
    [req.user.id, req.params.id]
  );

  // Annotate each lesson with access state
  for (const lesson of lessons) {
    const state = await getLessonAccessState(req.user.id, lesson.id);
    lesson.accessible = state.accessible;
    lesson.lockReason = state.reason || null;
  }

  res.json({ lessons });
});

// GET /modules/:id/lessons/:lessonId — full lesson content (gated)
router.get('/:id/lessons/:lessonId', requireAuth(), async (req, res) => {
  const state = await getLessonAccessState(req.user.id, req.params.lessonId);
  if (!state.accessible) return res.status(403).json({ error: state.reason });

  const { rows: [lesson] } = await pool.query(
    'SELECT * FROM lessons WHERE id = $1 AND module_id = $2',
    [req.params.lessonId, req.params.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

  res.json({ lesson });
});

// POST /modules/:id/lessons/:lessonId/complete — mark lesson done
router.post('/:id/lessons/:lessonId/complete', requireAuth(), async (req, res) => {
  const state = await getLessonAccessState(req.user.id, req.params.lessonId);
  if (!state.accessible) return res.status(403).json({ error: state.reason });

  await pool.query(
    `INSERT INTO student_lesson_progress (user_id, lesson_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user.id, req.params.lessonId]
  );

  const unlockedItems = await getUnlocksAfterLessonComplete(req.user.id, req.params.lessonId);
  res.json({ ok: true, unlockedItems });
});

module.exports = router;
