// How much of a garlic clove a solve is worth, based on how hard the drill is
// for *you*. Drills far below your rating are warm-ups and fill only part of a
// clove, so a full bulb takes real work at your level.
//
// "Your rating" is your endgame rating (shared/rating.js), which starts at
// your chess rating.
//
//   fit      | drill target vs your rating | clove value (levels 1-2)
//   stretch  | more than 350 above you     | 1 clove
//   core     | up to 350 above, or less    | 1 clove
//            | than 200 below              |
//   easy     | 200-499 below               | 1/2 clove
//   warm-up  | 500+ below                  | 1/4 clove
//
// A drill in your Endgame School rotation (or a due check-up) is at your
// level by definition and always fills a whole clove, even if the rating gap
// says "easy": your results say you still need it.
//
// Level 3 is worth 1.5x and the speed levels (4-5) 2x, capped at one clove,
// so getting fast at an easy mate still pays. Piece hints or takebacks halve
// it (written hints don't). Solving a position again right after its lesson
// earns a full clove, up to LESSON_CLOVES_PER_DAY times a day.

export const DEFAULT_RATING = 1000;
export const RATING_MIN = 100;
export const RATING_MAX = 3000;

export const RATING_SOURCES = {
  'chesscom-rapid': 'chess.com rapid',
  'chesscom-blitz': 'chess.com blitz',
  'chesscom-daily': 'chess.com daily',
  lichess: 'Lichess',
  fide: 'FIDE',
  cfc: 'CFC (Canada)',
  uscf: 'US Chess',
  guess: 'Best guess',
};

const FIT_VALUE = { stretch: 1, core: 1, easy: 0.5, warmup: 0.25 };
export const LESSON_CLOVES_PER_DAY = 2;

/** 'stretch' | 'core' | 'easy' | 'warmup' for this drill at this rating. */
export function drillFit(drill, rating) {
  const gap = (rating ?? DEFAULT_RATING) - drill.targetRating;
  if (gap >= 500) return 'warmup';
  if (gap >= 200) return 'easy';
  if (gap < -350) return 'stretch';
  return 'core';
}

export function levelBoost(level) {
  return level >= 4 ? 2 : level === 3 ? 1.5 : 1;
}

/** Clove fraction (0-1) earned by a successful solve. */
export function cloveValue({ drill, level, rating, hints = 0, takebacks = 0, lessonReplay = false, atLevel = false }) {
  if (lessonReplay) return 1;
  let v = (atLevel ? 1 : FIT_VALUE[drillFit(drill, rating)]) * levelBoost(level);
  if (hints > 0 || takebacks > 0) v *= 0.5;
  return Math.min(1, v);
}

/** Why a solve filled less than a whole clove (for the result screen), or null. */
export function cloveShortfall({ drill, rating, hints = 0, takebacks = 0, atLevel = false }) {
  if (hints > 0 && takebacks > 0) return 'halved: piece hint and takeback used';
  if (hints > 0) return 'halved: piece hint used';
  if (takebacks > 0) return 'halved: takeback used';
  if (atLevel) return null;
  const fit = drillFit(drill, rating);
  if (fit === 'easy') return 'easy for your rating';
  if (fit === 'warmup') return 'a warm-up for your rating';
  return null;
}

/** Where a new player starts on a drill: warm-ups skip the short positions. */
export function startingLevel(drill, rating) {
  const fit = drillFit(drill, rating);
  return fit === 'warmup' ? 3 : fit === 'easy' ? 2 : 1;
}

/** 2.75 -> "2¾", 0.375 -> "⅜", 3 -> "3". */
export function formatCloves(x) {
  const v = Math.max(0, Math.round(x * 8) / 8);
  const whole = Math.floor(v + 1e-9);
  const frac = Math.round((v - whole) * 8);
  const glyph = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][frac];
  if (!whole && glyph) return glyph;
  return `${whole}${glyph}`;
}

export function validRating(r) {
  const n = Math.round(Number(r));
  return Number.isFinite(n) && n >= RATING_MIN && n <= RATING_MAX ? n : null;
}
