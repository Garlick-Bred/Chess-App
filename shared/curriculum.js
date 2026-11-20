// Endgame School: a curriculum that serves endgames at your level.
//
// * "Now learning": up to ACTIVE_SIZE drills, rotated so you cycle between
//   endgames of similar difficulty. Drills you are struggling with come
//   first, then the ones closest to your endgame rating. Drills far above you
//   (stretch) only come in once the ones below them are learned.
// * Graduating: GRADUATE_AFTER clean solves in a row (no hints, no takebacks,
//   no failure, efficient play) moves a drill out of the daily rotation, and
//   the next one moves in.
// * Check-ups: a graduated drill comes back after REVIEW_DAYS (3, 7, 14, 30,
//   60 days), at most MAX_REVIEWS_PER_DAY a day. Passing pushes the next one
//   further out; failing sends the drill back to "Now learning".
// * Drills far below your rating are "placed out" and skipped, unless your
//   results say you're struggling with them.
import { addDays } from './scoring.js';

export const ACTIVE_SIZE = 3;
export const GRADUATE_AFTER = 5;
export const REVIEW_DAYS = [3, 7, 14, 30, 60];
export const MAX_REVIEWS_PER_DAY = 2;
/** Drills this far below your endgame rating are placed out. */
export const PLACED_OUT_BELOW = 500;
/** Drills this far above your endgame rating are stretch goals. */
export const STRETCH_ABOVE = 350;
/** Struggling: fewer than this share solved, over at least STRUGGLE_MIN_TRIES tries. */
export const STRUGGLE_RATE = 0.6;
export const STRUGGLE_MIN_TRIES = 2;

/** A clean solve: no failure, no help, and efficient play. */
export function isClean({ success, hints = 0, writtenHints = 0, takebacks = 0, efficiency = 1, goal = 'mate' }) {
  return !!success && hints === 0 && writtenHints === 0 && takebacks === 0 && (goal === 'hold' || efficiency >= 0.7);
}

/**
 * Where every drill stands for this player.
 * @param {{ drills: any[], progress: Record<string, any>, rating: number, today: string }} a
 */
export function buildCurriculum({ drills, progress, rating, today }) {
  const items = drills.map((d) => {
    const p = progress[d.id] ?? {};
    const attempts = p.attempts ?? 0;
    const rate = attempts ? (p.solves ?? 0) / attempts : null;
    const gap = d.targetRating - rating;
    const struggling = attempts >= STRUGGLE_MIN_TRIES && rate < STRUGGLE_RATE && gap <= STRETCH_ABOVE;
    return {
      id: d.id,
      drill: d,
      gap,
      rate,
      attempts,
      struggling,
      stretch: gap > STRETCH_ABOVE,
      graduated: p.status === 'graduated',
      cleanStreak: p.cleanStreak ?? 0,
      reviewDue: p.reviewDue ?? null,
      reviewStep: p.reviewStep ?? 0,
    };
  });
  const graduated = items.filter((i) => i.graduated).sort((a, b) => (a.reviewDue ?? '').localeCompare(b.reviewDue ?? ''));
  const placed = items.filter((i) => !i.graduated && i.gap < -PLACED_OUT_BELOW && !i.struggling);
  const learning = items
    .filter((i) => !i.graduated && !placed.includes(i))
    .sort(
      (a, b) =>
        Number(b.struggling) - Number(a.struggling) ||
        (a.struggling && b.struggling ? a.rate - b.rate : 0) ||
        Number(a.stretch) - Number(b.stretch) ||
        Math.abs(a.gap) - Math.abs(b.gap) ||
        a.drill.targetRating - b.drill.targetRating,
    );
  const active = learning.slice(0, ACTIVE_SIZE);
  return {
    active,
    upcoming: learning.slice(ACTIVE_SIZE),
    graduated,
    due: graduated.filter((i) => i.reviewDue && i.reviewDue <= today),
    placed,
  };
}

/** Is a solve of this drill "at your level" (worth a full clove)? */
export function atYourLevel(cur, drillId) {
  return cur.active.some((i) => i.id === drillId) || cur.due.some((i) => i.id === drillId);
}

/**
 * The next School puzzle: a due check-up first (a couple a day at most),
 * otherwise rotate through the drills you're learning.
 * @param {ReturnType<typeof buildCurriculum>} cur
 * @param {{ reviewsToday?: number, recent?: string[] }} opts recent = drill ids played this session, oldest first
 * @returns {{ drillId: string, mode: 'school' | 'review' } | null}
 */
export function pickSchoolDrill(cur, { reviewsToday = 0, recent = [] } = {}) {
  const last = recent[recent.length - 1];
  if (reviewsToday < MAX_REVIEWS_PER_DAY) {
    const review = cur.due.find((i) => i.id !== last) ?? cur.due[0];
    if (review && !recent.includes(review.id)) return { drillId: review.id, mode: 'review' };
  }
  const pool = cur.active.length ? cur.active : cur.graduated;
  if (!pool.length) return null;
  const plays = (id) => recent.filter((r) => r === id).length;
  const choices = pool.length > 1 ? pool.filter((i) => i.id !== last) : pool;
  // Fewest plays this session first; ties keep curriculum order (struggling first).
  const pick = choices.reduce((best, i) => (plays(i.id) < plays(best.id) ? i : best), choices[0]);
  return { drillId: pick.id, mode: cur.active.length ? 'school' : 'review' };
}

/**
 * Update a drill's School state after an attempt (lesson replays don't count).
 * @returns {{ cleanStreak: number, status: string, reviewDue: string|null, reviewStep: number,
 *   events: { graduated?: boolean, reviewPassed?: boolean, recheck?: boolean, demoted?: boolean } }}
 */
export function advanceSchool(prev, { success, clean }, today) {
  const s = {
    cleanStreak: prev?.cleanStreak ?? 0,
    status: prev?.status ?? 'learning',
    reviewDue: prev?.reviewDue ?? null,
    reviewStep: prev?.reviewStep ?? 0,
  };
  const events = {};
  if (s.status === 'graduated') {
    if (!success) {
      Object.assign(s, { status: 'learning', cleanStreak: 0, reviewDue: null, reviewStep: 0 });
      events.demoted = true;
    } else if (!clean) {
      s.reviewDue = addDays(today, 1);
      events.recheck = true;
    } else if (s.reviewDue && s.reviewDue <= today) {
      s.reviewStep += 1;
      s.reviewDue = addDays(today, REVIEW_DAYS[Math.min(s.reviewStep, REVIEW_DAYS.length - 1)]);
      events.reviewPassed = true;
    }
  } else if (clean) {
    s.cleanStreak += 1;
    if (s.cleanStreak >= GRADUATE_AFTER) {
      Object.assign(s, { status: 'graduated', reviewStep: 0, reviewDue: addDays(today, REVIEW_DAYS[0]) });
      events.graduated = true;
    }
  } else {
    s.cleanStreak = 0;
  }
  return { ...s, events };
}
