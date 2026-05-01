const pool = require('../../config/db');
const { generateCodes } = require('../../services/inviteCodeService');
const { parseApkg } = require('../../services/ankiParserService');
const {
  setCohortModules, grantModule, revokeModule,
  getCohortModules, getAccessMatrix,
} = require('../../services/cohortModuleService');

// ─── Students ────────────────────────────────────────────────────────────────

async function listStudents(req, res) {
  const { cohort_id, search, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = ['student'];
  const conditions = ['u.role = $1', 'u.deleted_at IS NULL'];

  if (cohort_id) { params.push(cohort_id); conditions.push(`u.cohort_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`); }

  const where = conditions.join(' AND ');
  params.push(parseInt(limit), offset);

  const { rows: students } = await pool.query(
    `SELECT u.id, u.name, u.email, u.cohort_id, u.test_date, u.goal_score, u.created_at,
            c.name AS cohort_name,
            (SELECT COUNT(*) FROM student_lesson_progress slp WHERE slp.user_id = u.id) AS lessons_completed,
            (SELECT COUNT(*) FROM student_lesson_progress slp
             JOIN lessons l ON l.id = slp.lesson_id
             JOIN modules m ON m.id = l.module_id
             WHERE slp.user_id = u.id) AS total_progress,
            (SELECT MAX(submitted_at) FROM test_sessions ts WHERE ts.user_id = u.id AND ts.status = 'submitted') AS last_active
     FROM users u
     LEFT JOIN cohorts c ON c.id = u.cohort_id
     WHERE ${where}
     ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) FROM users u WHERE ${where}`,
    params.slice(0, params.length - 2)
  );

  res.json({ students, total: parseInt(count), page: parseInt(page), limit: parseInt(limit) });
}

async function getStudent(req, res) {
  const { rows: [student] } = await pool.query(
    `SELECT u.id, u.name, u.email, u.cohort_id, u.test_date, u.goal_score, u.created_at,
            c.name AS cohort_name
     FROM users u LEFT JOIN cohorts c ON c.id = u.cohort_id
     WHERE u.id = $1 AND u.role = 'student' AND u.deleted_at IS NULL`,
    [req.params.id]
  );
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const { rows: progress } = await pool.query(
    `SELECT l.title, l.module_id, slp.completed_at
     FROM student_lesson_progress slp
     JOIN lessons l ON l.id = slp.lesson_id
     WHERE slp.user_id = $1
     ORDER BY slp.completed_at DESC`,
    [req.params.id]
  );

  const { rows: scores } = await pool.query(
    `SELECT ts.id, ts.percent_correct, ts.submitted_at, pt.title
     FROM test_sessions ts
     JOIN practice_tests pt ON pt.id = ts.practice_test_id
     WHERE ts.user_id = $1 AND ts.status = 'submitted'
     ORDER BY ts.submitted_at DESC LIMIT 10`,
    [req.params.id]
  );

  res.json({ student, progress, recentScores: scores });
}

async function updateStudent(req, res) {
  const { cohort_id, test_date, goal_score } = req.body;
  const { rows: [student] } = await pool.query(
    `UPDATE users SET
       cohort_id = COALESCE($1, cohort_id),
       test_date = COALESCE($2, test_date),
       goal_score = COALESCE($3, goal_score),
       updated_at = NOW()
     WHERE id = $4 AND deleted_at IS NULL
     RETURNING id, name, email, cohort_id, test_date, goal_score`,
    [cohort_id || null, test_date || null, goal_score || null, req.params.id]
  );
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ student });
}

async function deleteStudent(req, res) {
  await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  res.status(204).send();
}

// ─── Cohorts ─────────────────────────────────────────────────────────────────

async function listCohorts(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*, COUNT(u.id)::int AS student_count
     FROM cohorts c
     LEFT JOIN users u ON u.cohort_id = c.id AND u.deleted_at IS NULL
     GROUP BY c.id ORDER BY c.name`
  );
  res.json({ cohorts: rows });
}

async function createCohort(req, res) {
  const { name, start_date, end_date } = req.body;
  const { rows: [cohort] } = await pool.query(
    'INSERT INTO cohorts (name, start_date, end_date) VALUES ($1, $2, $3) RETURNING *',
    [name, start_date || null, end_date || null]
  );
  res.status(201).json({ cohort });
}

async function updateCohort(req, res) {
  const { name, start_date, end_date } = req.body;
  const { rows: [cohort] } = await pool.query(
    `UPDATE cohorts SET
       name = COALESCE($1, name),
       start_date = COALESCE($2, start_date),
       end_date = COALESCE($3, end_date)
     WHERE id = $4 RETURNING *`,
    [name || null, start_date || null, end_date || null, req.params.id]
  );
  if (!cohort) return res.status(404).json({ error: 'Cohort not found' });
  res.json({ cohort });
}

async function deleteCohort(req, res) {
  const { rows: [{ count }] } = await pool.query(
    'SELECT COUNT(*) FROM users WHERE cohort_id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (parseInt(count) > 0) return res.status(409).json({ error: 'Cohort has active students' });
  await pool.query('DELETE FROM cohorts WHERE id = $1', [req.params.id]);
  res.status(204).send();
}

// ─── Cohort × Module Access ───────────────────────────────────────────────────

async function getMatrix(req, res) {
  res.json(await getAccessMatrix());
}

async function setCohortModulesHandler(req, res) {
  const { module_ids = [] } = req.body;
  await setCohortModules(req.params.id, module_ids);
  res.json({ ok: true });
}

async function grantModuleHandler(req, res) {
  await grantModule(req.params.id, req.params.moduleId);
  res.json({ ok: true });
}

async function revokeModuleHandler(req, res) {
  await revokeModule(req.params.id, req.params.moduleId);
  res.status(204).send();
}

// ─── Modules ─────────────────────────────────────────────────────────────────

async function listModules(req, res) {
  const { rows } = await pool.query(
    `SELECT m.*, COUNT(l.id)::int AS lesson_count
     FROM modules m LEFT JOIN lessons l ON l.module_id = m.id
     GROUP BY m.id ORDER BY m.sort_order`
  );
  res.json({ modules: rows });
}

async function createModule(req, res) {
  const { title, description, icon, sort_order = 0 } = req.body;
  const { rows: [mod] } = await pool.query(
    'INSERT INTO modules (title, description, icon, sort_order) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description || null, icon || null, sort_order]
  );
  res.status(201).json({ module: mod });
}

async function updateModule(req, res) {
  const { title, description, icon, sort_order } = req.body;
  const { rows: [mod] } = await pool.query(
    `UPDATE modules SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       icon = COALESCE($3, icon),
       sort_order = COALESCE($4, sort_order)
     WHERE id = $5 RETURNING *`,
    [title || null, description || null, icon || null, sort_order ?? null, req.params.id]
  );
  if (!mod) return res.status(404).json({ error: 'Module not found' });
  res.json({ module: mod });
}

async function deleteModule(req, res) {
  await pool.query('DELETE FROM modules WHERE id = $1', [req.params.id]);
  res.status(204).send();
}

// ─── Lessons ─────────────────────────────────────────────────────────────────

async function createLesson(req, res) {
  const { title, content_url, content_type = 'video', sort_order = 0 } = req.body;
  const { rows: [lesson] } = await pool.query(
    `INSERT INTO lessons (module_id, title, content_url, content_type, sort_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, title, content_url || null, content_type, sort_order]
  );
  res.status(201).json({ lesson });
}

async function updateLesson(req, res) {
  const { title, content_url, content_type, sort_order } = req.body;
  const { rows: [lesson] } = await pool.query(
    `UPDATE lessons SET
       title = COALESCE($1, title),
       content_url = COALESCE($2, content_url),
       content_type = COALESCE($3, content_type),
       sort_order = COALESCE($4, sort_order)
     WHERE id = $5 AND module_id = $6 RETURNING *`,
    [title || null, content_url || null, content_type || null, sort_order ?? null,
     req.params.lessonId, req.params.id]
  );
  if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
  res.json({ lesson });
}

async function deleteLesson(req, res) {
  await pool.query('DELETE FROM lessons WHERE id = $1 AND module_id = $2', [req.params.lessonId, req.params.id]);
  res.status(204).send();
}

// ─── Invite Codes ─────────────────────────────────────────────────────────────

async function listInviteCodes(req, res) {
  const { cohort_id, used } = req.query;
  const params = [];
  const conditions = [];

  if (cohort_id) { params.push(cohort_id); conditions.push(`ic.cohort_id = $${params.length}`); }
  if (used === 'true') conditions.push('ic.used_by IS NOT NULL');
  if (used === 'false') conditions.push('ic.used_by IS NULL');

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ic.*, c.name AS cohort_name, u.name AS used_by_name
     FROM invite_codes ic
     LEFT JOIN cohorts c ON c.id = ic.cohort_id
     LEFT JOIN users u ON u.id = ic.used_by
     ${where} ORDER BY ic.created_at DESC`,
    params
  );
  res.json({ codes: rows });
}

async function createInviteCodes(req, res) {
  const { cohort_id, count = 10, expires_at } = req.body;
  const codes = await generateCodes({
    cohortId: cohort_id || null,
    count: Math.min(parseInt(count), 100),
    expiresAt: expires_at || null,
    createdBy: req.user.id,
  });
  res.status(201).json({ codes });
}

async function deleteInviteCode(req, res) {
  await pool.query('DELETE FROM invite_codes WHERE id = $1 AND used_by IS NULL', [req.params.id]);
  res.status(204).send();
}

// ─── Flashcard Decks ──────────────────────────────────────────────────────────

async function listDecks(req, res) {
  const { rows } = await pool.query(
    `SELECT fd.*, COUNT(f.id)::int AS card_count, l.title AS lesson_title
     FROM flashcard_decks fd
     LEFT JOIN flashcards f ON f.deck_id = fd.id
     LEFT JOIN lessons l ON l.id = fd.lesson_id
     GROUP BY fd.id, l.title ORDER BY fd.created_at DESC`
  );
  res.json({ decks: rows });
}

async function uploadDeck(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const { lesson_id, title } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const cards = await parseApkg(req.file.buffer);

  const { rows: [deck] } = await pool.query(
    `INSERT INTO flashcard_decks (lesson_id, title, source_file)
     VALUES ($1, $2, $3) RETURNING *`,
    [lesson_id || null, title, req.file.originalname]
  );

  // Bulk-insert cards
  let inserted = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const { rowCount } = await pool.query(
      `INSERT INTO flashcards (deck_id, front, back, anki_note_id, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (deck_id, anki_note_id) WHERE anki_note_id IS NOT NULL DO NOTHING`,
      [deck.id, c.front, c.back, c.ankiNoteId || null, i]
    );
    inserted += rowCount;
  }

  res.status(201).json({ deck, cardsInserted: inserted, cardsTotal: cards.length });
}

async function deleteDeck(req, res) {
  await pool.query('DELETE FROM flashcard_decks WHERE id = $1', [req.params.id]);
  res.status(204).send();
}

// ─── Practice Tests ───────────────────────────────────────────────────────────

async function listPracticeTests(req, res) {
  const { rows } = await pool.query(
    `SELECT pt.*, COUNT(q.id)::int AS question_count
     FROM practice_tests pt LEFT JOIN questions q ON q.practice_test_id = pt.id
     GROUP BY pt.id ORDER BY pt.created_at DESC`
  );
  res.json({ practiceTests: rows });
}

async function createPracticeTest(req, res) {
  const { module_id, lesson_id, title, duration_minutes = 90 } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const { rows: [test] } = await pool.query(
    'INSERT INTO practice_tests (module_id, lesson_id, title, duration_minutes) VALUES ($1, $2, $3, $4) RETURNING *',
    [module_id || null, lesson_id || null, title, duration_minutes]
  );
  res.status(201).json({ practiceTest: test });
}

async function addPassage(req, res) {
  const { content, sort_order = 0 } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  const { rows: [passage] } = await pool.query(
    'INSERT INTO passages (practice_test_id, content, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [req.params.id, content, sort_order]
  );
  res.status(201).json({ passage });
}

async function addQuestion(req, res) {
  const { passage_id, stem, option_a, option_b, option_c, option_d, correct_option, topic_tag, sort_order = 0 } = req.body;
  const required = { stem, option_a, option_b, option_c, option_d, correct_option };
  for (const [k, v] of Object.entries(required)) {
    if (!v) return res.status(400).json({ error: `${k} is required` });
  }
  if (!['A', 'B', 'C', 'D'].includes(correct_option)) {
    return res.status(400).json({ error: 'correct_option must be A, B, C, or D' });
  }
  const { rows: [question] } = await pool.query(
    `INSERT INTO questions (practice_test_id, passage_id, stem, option_a, option_b, option_c, option_d, correct_option, topic_tag, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [req.params.id, passage_id || null, stem, option_a, option_b, option_c, option_d, correct_option, topic_tag || null, sort_order]
  );
  res.status(201).json({ question });
}

async function updateQuestion(req, res) {
  const { stem, option_a, option_b, option_c, option_d, correct_option, topic_tag, sort_order } = req.body;
  if (correct_option && !['A', 'B', 'C', 'D'].includes(correct_option)) {
    return res.status(400).json({ error: 'correct_option must be A, B, C, or D' });
  }
  const { rows: [question] } = await pool.query(
    `UPDATE questions SET
       stem = COALESCE($1, stem),
       option_a = COALESCE($2, option_a), option_b = COALESCE($3, option_b),
       option_c = COALESCE($4, option_c), option_d = COALESCE($5, option_d),
       correct_option = COALESCE($6, correct_option),
       topic_tag = COALESCE($7, topic_tag),
       sort_order = COALESCE($8, sort_order)
     WHERE id = $9 AND practice_test_id = $10 RETURNING *`,
    [stem || null, option_a || null, option_b || null, option_c || null, option_d || null,
     correct_option || null, topic_tag || null, sort_order ?? null, req.params.questionId, req.params.id]
  );
  if (!question) return res.status(404).json({ error: 'Question not found' });
  res.json({ question });
}

// ─── Classes ─────────────────────────────────────────────────────────────────

async function listClasses(req, res) {
  const { rows } = await pool.query(
    `SELECT cl.*, c.name AS cohort_name
     FROM classes cl LEFT JOIN cohorts c ON c.id = cl.cohort_id
     ORDER BY cl.scheduled_at DESC NULLS LAST`
  );
  res.json({ classes: rows });
}

async function createClass(req, res) {
  const { cohort_id, title, description, scheduled_at, duration_minutes, meeting_url } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const { rows: [cls] } = await pool.query(
    `INSERT INTO classes (cohort_id, title, description, scheduled_at, duration_minutes, meeting_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [cohort_id || null, title, description || null, scheduled_at || null,
     duration_minutes || null, meeting_url || null, req.user.id]
  );
  res.status(201).json({ class: cls });
}

async function updateClass(req, res) {
  const { title, description, scheduled_at, duration_minutes, meeting_url, recording_url, status, cohort_id } = req.body;
  const { rows: [cls] } = await pool.query(
    `UPDATE classes SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       scheduled_at = COALESCE($3, scheduled_at),
       duration_minutes = COALESCE($4, duration_minutes),
       meeting_url = COALESCE($5, meeting_url),
       recording_url = COALESCE($6, recording_url),
       status = COALESCE($7, status),
       cohort_id = COALESCE($8, cohort_id)
     WHERE id = $9 RETURNING *`,
    [title || null, description || null, scheduled_at || null, duration_minutes || null,
     meeting_url || null, recording_url || null, status || null, cohort_id || null, req.params.id]
  );
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  res.json({ class: cls });
}

async function deleteClass(req, res) {
  await pool.query('DELETE FROM classes WHERE id = $1', [req.params.id]);
  res.status(204).send();
}

module.exports = {
  listStudents, getStudent, updateStudent, deleteStudent,
  listCohorts, createCohort, updateCohort, deleteCohort,
  getMatrix, setCohortModulesHandler, grantModuleHandler, revokeModuleHandler,
  listModules, createModule, updateModule, deleteModule,
  createLesson, updateLesson, deleteLesson,
  listInviteCodes, createInviteCodes, deleteInviteCode,
  listDecks, uploadDeck, deleteDeck,
  listPracticeTests, createPracticeTest, addPassage, addQuestion, updateQuestion,
  listClasses, createClass, updateClass, deleteClass,
};
