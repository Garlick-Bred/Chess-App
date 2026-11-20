// Endgame rating: an Elo-style rating for endgame technique, on the same scale
// as a chess rating.
//
// Every puzzle has a rating: the drill's target rating (the rating at which it
// is "your level" material) adjusted for the drill level. Solving a puzzle
// rated above you raises your rating a lot, one rated far below you barely or
// not at all, and failing lowers it - by more when the puzzle was easy for you.
// A solve never lowers it, even one that needed help.
//
// It starts at your chess rating and is gently pulled back toward it, so it
// settles a few hundred points either side of your real rating depending on
// how your endgames compare with the rest of your game.

export const DEFAULT_ENDGAME_RATING = 1000;
export const ENDGAME_RATING_MIN = 100;
export const ENDGAME_RATING_MAX = 3000;

/** Rating points added to the drill's target rating at each level. */
export const LEVEL_ADJUST = { 1: -100, 2: 0, 3: 100, 4: 175, 5: 250 };

/** Solves of puzzles rated this far below you can't raise your rating. */
export const NO_GAIN_BELOW = 400;

/** Share of the gap to your chess rating closed after each rated attempt. */
export const ANCHOR_PULL = 0.03;

export function puzzleRating(drill, level) {
  return drill.targetRating + (LEVEL_ADJUST[level] ?? 0);
}

/**
 * How well an attempt went, from 0 (failed) to 1 (clean solve).
 * Help or sloppy technique counts as a partial solve.
 */
export function solveScore({ success, hints = 0, writtenHints = 0, takebacks = 0, efficiency = 1, goal = 'mate' }) {
  if (!success) return 0;
  let s = 1;
  if (hints > 0 || takebacks > 0) s = 0.5;
  else if (writtenHints > 0) s = 0.75;
  if (goal !== 'hold' && efficiency < 0.5) s -= 0.25;
  return Math.max(0.25, s);
}

/** Bigger steps while the rating is still finding its level. */
export function kFactor(games) {
  return games < 15 ? 40 : games < 50 ? 28 : 20;
}

export function expectedScore(rating, puzzle) {
  return 1 / (1 + 10 ** ((puzzle - rating) / 400));
}

/**
 * One rated attempt.
 * @param {{ rating: number, games: number, puzzle: number, score: number, anchor?: number|null }} a
 * @returns {{ before: number, after: number, delta: number, expected: number, puzzle: number }}
 */
export function rateAttempt({ rating, games, puzzle, score, anchor = null }) {
  const expected = expectedScore(rating, puzzle);
  let perf = kFactor(games) * (score - expected);
  if (perf > 0 && puzzle <= rating - NO_GAIN_BELOW) perf = 0;
  let delta = perf;
  if (anchor != null && perf !== 0) {
    // The pull toward your chess rating never turns a good result into a
    // loss (or a bad one into a gain), and does nothing on no-gain puzzles.
    delta = perf + ANCHOR_PULL * (anchor - rating);
    delta = perf > 0 ? Math.max(0, delta) : Math.min(0, delta);
  }
  // Solving never costs rating; help just earns less.
  if (score > 0) delta = Math.max(0, delta);
  delta = Math.round(delta);
  const after = Math.max(ENDGAME_RATING_MIN, Math.min(ENDGAME_RATING_MAX, rating + delta));
  return { before: rating, after, delta: after - rating, expected, puzzle };
}

export function startingEndgameRating(chessRating) {
  return chessRating ?? DEFAULT_ENDGAME_RATING;
}
