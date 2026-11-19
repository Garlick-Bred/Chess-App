// How much of a garlic clove a solve is worth, based on how hard the drill is
// for *you*. Drills far below your rating are warm-ups and fill only part of a
// clove, so a full bulb takes real work at your level.
//
//   fit      | your rating vs drill target | clove value (levels 1-2)
//   core     | less than 200 above         | 1 clove
//   easy     | 200-499 above               | 1/2 clove
//   warm-up  | 500+ above                  | 1/4 clove
//
// Level 3 is worth 1.5x and the speed levels (4-5) 2x, capped at one clove,
// so getting fast at an easy mate still pays. Hints or takebacks halve it.

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

const FIT_VALUE = { core: 1, easy: 0.5, warmup: 0.25 };

/** 'core' | 'easy' | 'warmup' for this drill at this rating. */
export function drillFit(drill, rating) {
  const gap = (rating ?? DEFAULT_RATING) - drill.targetRating;
  if (gap >= 500) return 'warmup';
  if (gap >= 200) return 'easy';
  return 'core';
}

export function levelBoost(level) {
  return level >= 4 ? 2 : level === 3 ? 1.5 : 1;
}

/** Clove fraction (0-1) earned by a successful solve. */
export function cloveValue({ drill, level, rating, hints = 0, takebacks = 0 }) {
  let v = FIT_VALUE[drillFit(drill, rating)] * levelBoost(level);
  if (hints > 0 || takebacks > 0) v *= 0.5;
  return Math.min(1, v);
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
