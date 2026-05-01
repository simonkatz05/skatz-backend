const router = require('express').Router();
const requireAuth = require('../../middleware/auth');
const pool = require('../../config/db');

// GET /classes — upcoming and past classes for the student's cohort
router.get('/', requireAuth(), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cl.id, cl.title, cl.description, cl.scheduled_at, cl.duration_minutes,
            cl.meeting_url, cl.recording_url, cl.status, cl.created_at,
            c.name AS cohort_name
     FROM classes cl
     LEFT JOIN cohorts c ON c.id = cl.cohort_id
     WHERE cl.cohort_id IS NULL OR cl.cohort_id = $1
     ORDER BY cl.scheduled_at DESC NULLS LAST`,
    [req.user.cohort_id]
  );

  const now = new Date();
  const upcoming = rows.filter(r => r.scheduled_at && new Date(r.scheduled_at) >= now);
  const past = rows.filter(r => !r.scheduled_at || new Date(r.scheduled_at) < now);

  res.json({ upcoming, past });
});

module.exports = router;
