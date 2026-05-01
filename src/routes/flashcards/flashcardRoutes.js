const router = require('express').Router();
const requireAuth = require('../../middleware/auth');
const pool = require('../../config/db');
const { applyReview } = require('../../services/sm2Service');

// GET /decks — decks accessible to this student (lesson completed or no lesson gate)
router.get('/', requireAuth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT fd.id, fd.title, fd.created_at, l.title AS lesson_title,
            COUNT(f.id)::int AS total_cards,
            COUNT(cr.id) FILTER (WHERE cr.due_date <= CURRENT_DATE)::int AS due_count
     FROM flashcard_decks fd
     LEFT JOIN lessons l ON l.id = fd.lesson_id
     LEFT JOIN flashcards f ON f.deck_id = fd.id
     LEFT JOIN card_reviews cr ON cr.flashcard_id = f.id AND cr.user_id = $1
     WHERE fd.lesson_id IS NULL
        OR EXISTS (
          SELECT 1 FROM student_lesson_progress slp
          WHERE slp.user_id = $1 AND slp.lesson_id = fd.lesson_id
        )
     GROUP BY fd.id, l.title
     ORDER BY fd.created_at`,
    [req.user.id]
  );
  res.json({ decks: rows });
});

// GET /decks/:deckId/cards/due — cards due today (SM-2), up to 20
router.get('/:deckId/cards/due', requireAuth(), async (req, res) => {
  // Initialize card_reviews for any new cards (no row yet = due now)
  await pool.query(
    `INSERT INTO card_reviews (user_id, flashcard_id, due_date)
     SELECT $1, f.id, CURRENT_DATE
     FROM flashcards f
     WHERE f.deck_id = $2
       AND NOT EXISTS (
         SELECT 1 FROM card_reviews cr
         WHERE cr.user_id = $1 AND cr.flashcard_id = f.id
       )
     ON CONFLICT DO NOTHING`,
    [req.user.id, req.params.deckId]
  );

  const { rows } = await pool.query(
    `SELECT f.id, f.front, f.back, f.sort_order,
            cr.ease_factor, cr.interval_days, cr.repetitions, cr.due_date, cr.last_reviewed
     FROM card_reviews cr
     JOIN flashcards f ON f.id = cr.flashcard_id
     WHERE cr.user_id = $1
       AND f.deck_id = $2
       AND cr.due_date <= CURRENT_DATE
     ORDER BY cr.due_date, f.sort_order
     LIMIT 20`,
    [req.user.id, req.params.deckId]
  );

  res.json({ cards: rows, count: rows.length });
});

// POST /decks/:deckId/cards/:cardId/review — submit SM-2 rating
router.post('/:deckId/cards/:cardId/review', requireAuth(), async (req, res) => {
  const quality = parseInt(req.body.quality);
  if (isNaN(quality) || quality < 0 || quality > 5) {
    return res.status(400).json({ error: 'quality must be an integer 0–5' });
  }

  const { rows: [current] } = await pool.query(
    `SELECT * FROM card_reviews WHERE user_id = $1 AND flashcard_id = $2`,
    [req.user.id, req.params.cardId]
  );

  const state = current || { ease_factor: 2.5, interval_days: 1, repetitions: 0 };
  const next = applyReview({
    easeFactor: parseFloat(state.ease_factor),
    intervalDays: parseInt(state.interval_days),
    repetitions: parseInt(state.repetitions),
    quality,
  });

  await pool.query(
    `INSERT INTO card_reviews (user_id, flashcard_id, ease_factor, interval_days, repetitions, due_date, last_reviewed)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id, flashcard_id) DO UPDATE
       SET ease_factor = $3, interval_days = $4, repetitions = $5,
           due_date = $6, last_reviewed = NOW()`,
    [req.user.id, req.params.cardId, next.easeFactor, next.intervalDays, next.repetitions, next.dueDate]
  );

  res.json({
    nextDue: next.dueDate,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
    repetitions: next.repetitions,
  });
});

module.exports = router;
