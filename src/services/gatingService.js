const pool = require('../config/db');

/**
 * Returns whether a student can access a given lesson.
 * Rules:
 *  - Module must be accessible to the student's cohort (cohort_module_access)
 *  - First lesson (sort_order=0) of an accessible module: always unlocked
 *  - Subsequent lessons: previous lesson (sort_order - 1) must be completed
 */
async function getLessonAccessState(userId, lessonId) {
  // Fetch lesson + module
  const { rows } = await pool.query(
    `SELECT l.id, l.module_id, l.sort_order,
            u.cohort_id
     FROM lessons l
     JOIN users u ON u.id = $1
     WHERE l.id = $2`,
    [userId, lessonId]
  );

  if (rows.length === 0) return { accessible: false, reason: 'Lesson not found' };
  const lesson = rows[0];

  // Check cohort → module access (admins bypass)
  const { rows: access } = await pool.query(
    `SELECT 1 FROM cohort_module_access
     WHERE cohort_id = $1 AND module_id = $2`,
    [lesson.cohort_id, lesson.module_id]
  );
  if (access.length === 0) return { accessible: false, reason: 'Module not unlocked for cohort' };

  // First lesson is always accessible once module is unlocked
  if (lesson.sort_order === 0) return { accessible: true };

  // Find the previous lesson in the same module
  const { rows: prevLesson } = await pool.query(
    `SELECT id FROM lessons
     WHERE module_id = $1 AND sort_order = $2`,
    [lesson.module_id, lesson.sort_order - 1]
  );
  if (prevLesson.length === 0) return { accessible: true }; // no prior lesson exists

  const { rows: progress } = await pool.query(
    `SELECT 1 FROM student_lesson_progress
     WHERE user_id = $1 AND lesson_id = $2`,
    [userId, prevLesson[0].id]
  );

  if (progress.length === 0) {
    return { accessible: false, reason: 'Complete the previous lesson first' };
  }
  return { accessible: true };
}

/**
 * Called after a lesson is completed.
 * Returns the list of items newly unlocked as a result.
 */
async function getUnlocksAfterLessonComplete(userId, lessonId) {
  const unlocked = [];

  // Flashcard deck attached to this lesson
  const { rows: decks } = await pool.query(
    `SELECT id, title FROM flashcard_decks WHERE lesson_id = $1`,
    [lessonId]
  );
  for (const deck of decks) {
    unlocked.push({ type: 'deck', id: deck.id, title: deck.title });
  }

  // Practice test attached to this lesson
  const { rows: tests } = await pool.query(
    `SELECT id, title FROM practice_tests WHERE lesson_id = $1`,
    [lessonId]
  );
  for (const test of tests) {
    unlocked.push({ type: 'practice_test', id: test.id, title: test.title });
  }

  // Next lesson in the module
  const { rows: [lesson] } = await pool.query(
    'SELECT module_id, sort_order FROM lessons WHERE id = $1',
    [lessonId]
  );
  if (lesson) {
    const { rows: nextLesson } = await pool.query(
      `SELECT id, title FROM lessons
       WHERE module_id = $1 AND sort_order = $2`,
      [lesson.module_id, lesson.sort_order + 1]
    );
    if (nextLesson[0]) {
      unlocked.push({ type: 'lesson', id: nextLesson[0].id, title: nextLesson[0].title });
    }
  }

  return unlocked;
}

/**
 * Returns all modules accessible to a student, with per-lesson state.
 */
async function getStudentModules(userId) {
  const { rows: modules } = await pool.query(
    `SELECT m.id, m.title, m.description, m.icon, m.sort_order
     FROM modules m
     JOIN cohort_module_access cma ON cma.module_id = m.id
     JOIN users u ON u.cohort_id = cma.cohort_id
     WHERE u.id = $1
     ORDER BY m.sort_order`,
    [userId]
  );

  for (const mod of modules) {
    const { rows: lessons } = await pool.query(
      `SELECT l.id, l.title, l.content_type, l.sort_order,
              CASE WHEN slp.user_id IS NOT NULL THEN true ELSE false END AS completed
       FROM lessons l
       LEFT JOIN student_lesson_progress slp
         ON slp.lesson_id = l.id AND slp.user_id = $1
       WHERE l.module_id = $2
       ORDER BY l.sort_order`,
      [userId, mod.id]
    );
    mod.lessons = lessons;

    const totalLessons = lessons.length;
    const completedLessons = lessons.filter(l => l.completed).length;
    mod.progress = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;
  }

  return modules;
}

module.exports = { getLessonAccessState, getUnlocksAfterLessonComplete, getStudentModules };
