/**
 * Pure SM-2 spaced-repetition algorithm.
 * quality: 0–5  (0-2 = fail, 3-5 = pass)
 *   0 = complete blackout
 *   3 = correct with difficulty
 *   5 = perfect
 */
function applyReview({ easeFactor, intervalDays, repetitions, quality }) {
  if (quality < 0 || quality > 5) throw new Error('quality must be 0–5');

  const newEase = Math.max(1.3, easeFactor + (quality - 3) * (0.1 - (5 - quality) * 0.08));

  let newInterval;
  let newRepetitions;

  if (quality < 3) {
    newInterval = 1;
    newRepetitions = 0;
  } else {
    if (repetitions === 0) newInterval = 1;
    else if (repetitions === 1) newInterval = 6;
    else newInterval = Math.round(intervalDays * easeFactor);
    newRepetitions = repetitions + 1;
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + newInterval);
  const dueDateStr = dueDate.toISOString().slice(0, 10); // YYYY-MM-DD

  return {
    easeFactor: parseFloat(newEase.toFixed(4)),
    intervalDays: newInterval,
    repetitions: newRepetitions,
    dueDate: dueDateStr,
  };
}

module.exports = { applyReview };
