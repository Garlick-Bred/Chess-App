// Move grading against an endgame tablebase (Lichess API format).
//
// The policy, in one paragraph:
//   * A move that changes the theoretical result (win -> draw/loss, or
//     draw -> loss) is a BLUNDER. That is the only thing that fails a drill.
//   * A move that keeps the result is never "wrong". We measure how much it
//     wastes compared with perfect play, using distance-to-mate (DTM) when
//     available and distance-to-zeroing (DTZ) otherwise:
//         waste = distance after your move - best possible distance (in plies)
//     waste 0  -> Best        (as fast as perfect play)
//     waste 2  -> Good        (keeps the win; one move slower than perfect)
//     waste 4-6-> Inaccuracy  (you went backwards 2-3 moves)
//     waste 8+ -> Mistake     (still winning, but a big step backwards)
//   * Wasted moves cost points smoothly through "efficiency", not as a fail.
//   * Separately, a rolling window watches for STALLING: if you have not
//     shortened the distance to the goal over your last few moves, the app
//     nudges you (and offers a hint) instead of docking points twice.
//   * The 50-move rule (and a per-drill move cap) is the hard limit.
//
// Plies vs moves: tablebase distances are in plies (half-moves). Two plies =
// one full move. Waste is always even when the defender plays perfectly.

export const GRADES = ['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'only'];

export const GRADE_INFO = {
  best: { label: 'Best', symbol: '★', color: '#81b64c', text: 'As fast as perfect play.' },
  only: { label: 'Only move', symbol: '!', color: '#26c2a3', text: 'The only move that holds. Great find.' },
  good: { label: 'Good', symbol: '✓', color: '#95b776', text: 'Keeps the result, one move slower than perfect.' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c631', text: 'Still winning, but you went backwards.' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ffa459', text: 'Still winning, but a big step backwards.' },
  blunder: { label: 'Blunder', symbol: '??', color: '#fa412d', text: 'This changes the result.' },
};

const WIN = new Set(['win', 'syzygy-win', 'maybe-win']);
const LOSS = new Set(['loss', 'syzygy-loss', 'maybe-loss']);
// cursed-win / blessed-loss are wins/losses that the 50-move rule turns into draws.
const DRAW = new Set(['draw', 'cursed-win', 'blessed-loss']);

/** Result for the side to move in a position with this category. */
export function outcomeOf(category) {
  if (WIN.has(category)) return 'win';
  if (LOSS.has(category)) return 'loss';
  if (DRAW.has(category)) return 'draw';
  return 'unknown';
}

/** Result for the player who MADE the move (move categories are from the opponent's view). */
export function moverOutcome(moveCategory) {
  const o = outcomeOf(moveCategory);
  return o === 'win' ? 'loss' : o === 'loss' ? 'win' : o;
}

const RANK = { loss: 0, draw: 1, win: 2 };

/**
 * Pick the distance metric for a set of moves. DTM is only trusted if every
 * candidate has it; otherwise fall back to DTZ for all of them so we never
 * compare apples with oranges.
 */
export function pickMetric(moves) {
  if (moves.length && moves.every((m) => m.dtm != null)) return 'dtm';
  if (moves.length && moves.every((m) => m.dtz != null)) return 'dtz';
  return null;
}

function dist(m, metric) {
  const v = metric === 'dtm' ? m.dtm : m.dtz;
  return v == null ? null : Math.abs(v);
}

/**
 * Grade one move.
 * @param {object} tb      tablebase response for the position BEFORE the move (mover to move)
 * @param {string} uci     the move played, e.g. "e2e4" or "e7e8q"
 * @param {object} [opts]
 * @param {boolean} [opts.reachesGoal] the move completes the drill goal (mate/promote/convert)
 * @returns {{grade:string, wastePlies:number, before:string, after:string, metric:string|null,
 *            bestUci:string[], distAfter:number|null, bestDist:number|null, holdingMoves:number}}
 */
export function gradeMove(tb, uci, opts = {}) {
  const moves = tb?.moves ?? [];
  const before = outcomeOf(tb?.category);
  const played = moves.find((m) => m.uci === uci);
  const base = { wastePlies: 0, before, metric: null, bestUci: [], distAfter: null, bestDist: null, holdingMoves: 0 };
  if (!played) return { ...base, grade: 'best', after: before, unknown: true };

  const after = moverOutcome(played.category);
  // Moves that keep the current result.
  const keeping = moves.filter((m) => moverOutcome(m.category) === before);
  base.holdingMoves = keeping.length;

  if (before !== 'unknown' && after !== 'unknown' && RANK[after] < RANK[before]) {
    return { ...base, grade: 'blunder', after, bestUci: bestMoves(tb).map((m) => m.uci) };
  }

  if (before === 'draw') {
    // Defending: every drawing move is equally good. Reward finding the only one.
    return { ...base, grade: keeping.length === 1 ? 'only' : 'best', after, bestUci: keeping.map((m) => m.uci) };
  }

  if (before !== 'win') return { ...base, grade: 'best', after };

  const metric = pickMetric(keeping);
  if (!metric) return { ...base, grade: 'best', after };
  const best = Math.min(...keeping.map((m) => dist(m, metric)));
  const d = dist(played, metric);
  const bestUci = keeping.filter((m) => dist(m, metric) === best).map((m) => m.uci);
  let waste = Math.max(0, d - best);
  // Completing the goal (mate, promotion, winning the last piece) is always
  // fine as long as the win is kept - this mirrors the "conversion allowance"
  // used by tablebase trainers such as Chess Tempo.
  if (opts.reachesGoal) waste = 0;
  // With DTZ, a zeroing move (capture / pawn move) that keeps the win is progress.
  if (metric === 'dtz' && played.zeroing) waste = 0;
  return { ...base, grade: gradeForWaste(waste), after, metric, bestUci, distAfter: d, bestDist: best, wastePlies: waste };
}

export function gradeForWaste(wastePlies) {
  if (wastePlies <= 0) return 'best';
  if (wastePlies <= 2) return 'good';
  if (wastePlies <= 6) return 'inaccuracy';
  return 'mistake';
}

/** Best moves for the side to move (Lichess lists the best move first). */
export function bestMoves(tb) {
  const moves = tb?.moves ?? [];
  if (!moves.length) return [];
  const before = outcomeOf(tb.category);
  const keeping = moves.filter((m) => moverOutcome(m.category) === before);
  if (!keeping.length) return [moves[0]];
  if (before === 'draw') return keeping;
  const metric = pickMetric(keeping);
  if (!metric) return [keeping[0]];
  const want = before === 'win' ? Math.min(...keeping.map((m) => dist(m, metric))) : Math.max(...keeping.map((m) => dist(m, metric)));
  return keeping.filter((m) => dist(m, metric) === want);
}

/**
 * Distance (plies) to the end for the side to move, used for stall detection.
 * Prefers DTM. Returns null when unknown.
 */
export function positionDistance(tb) {
  if (!tb) return null;
  if (tb.dtm != null) return Math.abs(tb.dtm);
  if (tb.dtz != null) return Math.abs(tb.dtz);
  return null;
}

export const STALL_WINDOW = 5;

/**
 * Stall detection: given the distance at each of the user's turns (oldest
 * first), return true if the last STALL_WINDOW moves made no net progress.
 */
export function isStalling(distances, window = STALL_WINDOW) {
  const xs = distances.filter((x) => x != null);
  if (xs.length <= window) return false;
  const now = xs[xs.length - 1];
  const then = xs[xs.length - 1 - window];
  return now >= then;
}

/**
 * The computer's reply.
 *  - Losing side: longest resistance (max distance), random among ties.
 *  - Drawing side (you are defending): a drawing move chosen with a
 *    "pressure" heuristic - prefer pawn pushes, checks and king moves toward
 *    the pawn, so you actually have to defend.
 *  - Winning side (after a blunder): fastest win.
 * @param {object} tb       tablebase response (computer to move)
 * @param {object} ctx      { rng?: () => number, scoreMove?: (uci) => number }
 */
export function pickComputerMove(tb, ctx = {}) {
  const rng = ctx.rng ?? Math.random;
  const moves = tb?.moves ?? [];
  if (!moves.length) return null;
  const before = outcomeOf(tb.category);
  if (before === 'draw') {
    const keeping = moves.filter((m) => moverOutcome(m.category) === 'draw');
    const pool = keeping.length ? keeping : moves;
    const weights = pool.map((m) => Math.max(0.1, ctx.scoreMove ? ctx.scoreMove(m) : 1));
    return weightedPick(pool, weights, rng);
  }
  const best = bestMoves(tb);
  return best[Math.floor(rng() * best.length)] ?? moves[0];
}

function weightedPick(items, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Efficiency in [0, 1]: the share of your moves that were real progress.
 * wasted full moves W = sum(waste)/2; efficiency = (M - W) / M.
 */
export function efficiency(userMoves, wastePlies) {
  if (!userMoves) return 1;
  const w = wastePlies / 2;
  return Math.max(0, Math.min(1, (userMoves - w) / userMoves));
}
