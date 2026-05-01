const pool = require('../config/db');

/**
 * Starts a new test session. Returns session + all questions (without correct answers).
 */
async function startSession(userId, practiceTestId) {
  const { rows: [test] } = await pool.query(
    'SELECT * FROM practice_tests WHERE id = $1',
    [practiceTestId]
  );
  if (!test) {
    const err = new Error('Practice test not found'); err.status = 404; throw err;
  }

  const { rows: [session] } = await pool.query(
    `INSERT INTO test_sessions (user_id, practice_test_id, time_remaining_seconds)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, practiceTestId, test.duration_minutes * 60]
  );

  const { rows: questions } = await pool.query(
    `SELECT q.id, q.passage_id, q.stem, q.option_a, q.option_b, q.option_c, q.option_d,
            q.topic_tag, q.sort_order,
            p.content AS passage_content
     FROM questions q
     LEFT JOIN passages p ON p.id = q.passage_id
     WHERE q.practice_test_id = $1
     ORDER BY q.sort_order`,
    [practiceTestId]
  );

  if (questions.length > 0) {
    const vals = questions.map((_, i) => `($1, $${i + 2})`).join(', ');
    await pool.query(
      `INSERT INTO test_answers (session_id, question_id) VALUES ${vals} ON CONFLICT DO NOTHING`,
      [session.id, ...questions.map(q => q.id)]
    );
  }

  return {
    session,
    test: { id: test.id, title: test.title, durationMinutes: test.duration_minutes },
    questions,
  };
}

/**
 * Returns the current state of a session (for resuming).
 */
async function getSession(sessionId, userId) {
  const { rows: [session] } = await pool.query(
    'SELECT * FROM test_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (!session) {
    const err = new Error('Session not found'); err.status = 404; throw err;
  }

  const elapsedSec = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
  const timeRemaining = Math.max(0, session.time_remaining_seconds - elapsedSec);

  const { rows: answers } = await pool.query(
    'SELECT question_id, chosen_option, is_flagged FROM test_answers WHERE session_id = $1',
    [sessionId]
  );

  return { session: { ...session, timeRemaining }, answers };
}

/**
 * Saves/updates a batch of answers (auto-save).
 */
async function saveAnswers(sessionId, userId, answers) {
  const { rows: [session] } = await pool.query(
    'SELECT id, status FROM test_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (!session) { const err = new Error('Session not found'); err.status = 404; throw err; }
  if (session.status !== 'in_progress') {
    const err = new Error('Session already submitted'); err.status = 409; throw err;
  }

  for (const ans of answers) {
    await pool.query(
      `INSERT INTO test_answers (session_id, question_id, chosen_option, is_flagged, answered_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (session_id, question_id) DO UPDATE
         SET chosen_option = EXCLUDED.chosen_option,
             is_flagged = EXCLUDED.is_flagged,
             answered_at = EXCLUDED.answered_at`,
      [sessionId, ans.questionId, ans.chosenOption || null, ans.isFlagged || false]
    );
  }
}

/**
 * Submits a session: scores every answer, then delegates to getResults.
 */
async function submitSession(sessionId, userId) {
  const { rows: [session] } = await pool.query(
    'SELECT * FROM test_sessions WHERE id = $1 AND user_id = $2',
    [sessionId, userId]
  );
  if (!session) { const err = new Error('Session not found'); err.status = 404; throw err; }
  if (session.status !== 'in_progress') {
    const err = new Error('Session already submitted'); err.status = 409; throw err;
  }

  const { rows: answers } = await pool.query(
    `SELECT ta.id, ta.chosen_option, q.correct_option
     FROM test_answers ta
     JOIN questions q ON q.id = ta.question_id
     WHERE ta.session_id = $1`,
    [sessionId]
  );

  let correct = 0;
  for (const ans of answers) {
    const isCorrect = ans.chosen_option === ans.correct_option;
    if (isCorrect) correct++;
    await pool.query('UPDATE test_answers SET is_correct = $1 WHERE id = $2', [isCorrect, ans.id]);
  }

  const percentCorrect = answers.length > 0
    ? parseFloat(((correct / answers.length) * 100).toFixed(2))
    : 0;

  await pool.query(
    `UPDATE test_sessions SET status = 'submitted', submitted_at = NOW(), percent_correct = $1 WHERE id = $2`,
    [percentCorrect, sessionId]
  );

  return getResults(sessionId, userId);
}

/**
 * Returns full results including topic breakdown and cohort percentile.
 */
async function getResults(sessionId, userId) {
  const { rows: [session] } = await pool.query(
    `SELECT ts.*, u.cohort_id
     FROM test_sessions ts
     JOIN users u ON u.id = ts.user_id
     WHERE ts.id = $1 AND ts.user_id = $2`,
    [sessionId, userId]
  );
  if (!session) { const err = new Error('Session not found'); err.status = 404; throw err; }

  const { rows: answers } = await pool.query(
    `SELECT ta.question_id, ta.chosen_option, ta.is_correct, ta.is_flagged, q.topic_tag, q.correct_option
     FROM test_answers ta
     JOIN questions q ON q.id = ta.question_id
     WHERE ta.session_id = $1`,
    [sessionId]
  );

  const correctCount = answers.filter(a => a.is_correct).length;

  // Topic breakdown
  const topicMap = {};
  for (const a of answers) {
    const tag = a.topic_tag || 'Uncategorized';
    if (!topicMap[tag]) topicMap[tag] = { topic: tag, correct: 0, total: 0 };
    topicMap[tag].total++;
    if (a.is_correct) topicMap[tag].correct++;
  }
  const topicBreakdown = Object.values(topicMap).map(t => ({
    ...t,
    accuracy: t.total > 0 ? parseFloat(((t.correct / t.total) * 100).toFixed(1)) : 0,
  }));

  // Cohort percentile
  const { rows: cohortRows } = await pool.query(
    `SELECT ts2.percent_correct
     FROM test_sessions ts2
     JOIN users u ON u.id = ts2.user_id
     WHERE ts2.practice_test_id = $1
       AND ts2.status = 'submitted'
       AND u.cohort_id = $2
     ORDER BY ts2.percent_correct`,
    [session.practice_test_id, session.cohort_id]
  );

  const scores = cohortRows.map(r => parseFloat(r.percent_correct));
  const below = scores.filter(s => s < parseFloat(session.percent_correct)).length;
  const cohortPercentile = scores.length > 1
    ? parseFloat(((below / scores.length) * 100).toFixed(1))
    : null;

  return {
    sessionId,
    score: {
      correct: correctCount,
      total: answers.length,
      percentCorrect: parseFloat(session.percent_correct),
    },
    topicBreakdown,
    cohortPercentile,
    cohortScores: scores,
    answers,
  };
}

module.exports = { startSession, getSession, saveAnswers, submitSession, getResults };
