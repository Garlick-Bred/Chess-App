// Drill catalog. Shared by the client (to run drills) and the server (to score
// attempts), so there is one source of truth for points, par times and goals.
//
// goal:
//   'mate'    - deliver checkmate
//   'convert' - win all the defender's material (or mate), keeping the win
//   'promote' - promote the pawn while keeping the win
//   'hold'    - defend: keep the draw for `holdMoves` of your moves
//
// role: 'attacker' (you are winning) or 'defender' (you are holding a draw).
//
// Levels 1-3 use progressively longer / harder positions from the puzzle bank.
// Levels 4-5 reuse the hardest positions with a tighter par time (speed mastery).
// spm = seconds per move used to compute par time at each level.
// targetRating = roughly the rating at which this drill is core learning;
// well above it the drill is a warm-up (see shared/cloves.js). It is also the
// drill's puzzle rating at level 2 (shared/rating.js). The baseline follows
// Silman's Complete Endgame Course where it covers the drill (basic mates
// under 1000; opposition 1000-1399; Lucena, Philidor and queen vs pawn
// 1400-1599). Queen vs rook and bishop + knight sit at expert level (2000):
// Silman leaves bishop + knight out entirely, and grandmasters still miss
// queen vs rook. See docs/RESEARCH.md.

/** @typedef {'mate'|'convert'|'promote'|'hold'} Goal */

export const TIERS = {
  1: { name: 'Fundamentals', difficulty: 'Easy', color: '#81b64c' },
  2: { name: 'Pawn endings', difficulty: 'Medium', color: '#e8b33a' },
  3: { name: 'Core technique', difficulty: 'Hard', color: '#e07b39' },
  4: { name: 'Advanced', difficulty: 'Very hard', color: '#d64545' },
};

export const MAX_LEVEL = 5;

/** @type {Array<any>} */
export const DRILLS = [
  {
    id: 'krrk',
    targetRating: 400,
    name: 'Ladder Mate',
    material: 'Two rooks vs king',
    tier: 1,
    basePoints: 8,
    goal: 'mate',
    role: 'attacker',
    thinkFactor: 0.8,
    spm: [4, 3, 2.5, 2, 1.5],
    summary: 'Roll the king to the edge with alternating rook checks.',
    tips: [
      'The rooks take turns: one guards a rank, the other checks on the next rank.',
      'If the king walks toward a rook, swing that rook to the far side of the board, then keep laddering.',
      'You never need your own king for this mate.',
    ],
  },
  {
    id: 'kqk',
    targetRating: 600,
    name: 'Queen Mate',
    material: 'King + queen vs king',
    tier: 1,
    basePoints: 10,
    goal: 'mate',
    role: 'attacker',
    thinkFactor: 1,
    spm: [4, 3.5, 3, 2.5, 2],
    summary: 'Shrink the box with the queen, then bring your king in for the mate.',
    tips: [
      'Put the queen a knight\'s move away from the enemy king: it shadows the king and shrinks its box every move.',
      'Once the king is stuck on the edge, STOP squeezing. Walk your own king over first.',
      'Stalemate check: before each queen move, make sure the defending king still has a legal move.',
      'Mate patterns: queen on the edge supported by your king, or queen directly in front of the king with your king opposite.',
    ],
  },
  {
    id: 'krk',
    targetRating: 800,
    name: 'Rook Mate',
    material: 'King + rook vs king',
    tier: 1,
    basePoints: 15,
    goal: 'mate',
    role: 'attacker',
    thinkFactor: 1.1,
    spm: [4.5, 4, 3.5, 3, 2.5],
    summary: 'The box method: cut the king off, shrink the box, keep the rook protected.',
    tips: [
      'Use the rook to fence the king into a box (a rectangle of squares it cannot leave).',
      'Shrink the box whenever it is safe. If the king attacks the rook, protect it with your king or move it far away along the same line.',
      'Bring your king toward the enemy king - the rook cannot mate alone.',
      'On the edge, aim for "opposition": kings facing each other with one square between. Then check on the edge = mate.',
      'Need to lose a move? Shuffle the rook along its rank or file (a waiting move) without releasing the box.',
    ],
  },
  {
    id: 'kpk-win',
    targetRating: 1000,
    name: 'Escort the Pawn',
    material: 'King + pawn vs king (win)',
    tier: 2,
    basePoints: 18,
    goal: 'promote',
    role: 'attacker',
    thinkFactor: 1.2,
    capMoves: 20,
    goalFraction: 0.45,
    spm: [5, 4.5, 4, 3.5, 3],
    summary: 'Lead with the king, win the key squares, then push.',
    tips: [
      'King first, pawn second. Get your king in front of the pawn.',
      'Key squares: if your king reaches a square two ranks in front of the pawn (or the three squares there), the pawn promotes by force (not for rook pawns).',
      'Use the opposition: kings facing each other with one square between - the side NOT to move has the opposition.',
      'Push the pawn only when it cannot be caught or when your king already controls its path.',
    ],
  },
  {
    id: 'kpk-draw',
    targetRating: 1000,
    name: 'Opposition Defence',
    material: 'King vs king + pawn (draw)',
    tier: 2,
    basePoints: 18,
    goal: 'hold',
    role: 'defender',
    thinkFactor: 1.2,
    holdMoves: [8, 10, 12, 12, 14],
    spm: [5, 4.5, 4, 3.5, 3],
    summary: 'Stand in front of the pawn and keep the opposition.',
    tips: [
      'Keep your king directly in front of the pawn.',
      'When the enemy king steps up, take the opposition (face it with one square between).',
      'When the pawn advances, step STRAIGHT back, not sideways, so you can retake the opposition next move.',
      'Against a rook pawn, just reach the corner - it is a draw.',
    ],
  },
  {
    id: 'kqkp',
    targetRating: 1450,
    name: 'Queen vs Pawn',
    material: 'King + queen vs king + pawn on the 7th',
    tier: 3,
    basePoints: 28,
    goal: 'convert',
    role: 'attacker',
    thinkFactor: 1.3,
    goalFraction: 0.6,
    spm: [5, 4.5, 4, 3.5, 3],
    summary: 'Force the king in front of its pawn, then bring your king one step closer. Repeat.',
    tips: [
      'Check, pin, or attack the pawn so the defending king has to step in front of it (onto the promotion square).',
      'Every time the king blocks its own pawn, you gain one free move: use it to bring your king closer.',
      'Repeat until your king is close enough to help win the pawn or mate.',
      'Bishop- and rook-pawns are usually draws because of stalemate tricks - these drills use pawns you can beat.',
    ],
  },
  {
    id: 'kbbk',
    targetRating: 1400,
    name: 'Two Bishops Mate',
    material: 'King + two bishops vs king',
    tier: 3,
    basePoints: 30,
    goal: 'mate',
    role: 'attacker',
    thinkFactor: 1.3,
    spm: [5, 4.5, 4, 3.5, 3],
    summary: 'Bishops side-by-side form a wall. Drive the king to a corner.',
    tips: [
      'Two bishops on neighbouring diagonals make a wall the king cannot cross.',
      'Use your king to take away squares in front of the wall, then advance the wall.',
      'Mate only happens in a corner: push to the edge first, then along the edge to a corner.',
      'Watch for stalemate when the king is boxed into two or three squares.',
    ],
  },
  {
    id: 'lucena',
    targetRating: 1400,
    name: 'Lucena: Build a Bridge',
    material: 'Rook + pawn vs rook (win)',
    tier: 3,
    basePoints: 32,
    goal: 'promote',
    role: 'attacker',
    thinkFactor: 1.4,
    capMoves: 18,
    goalFraction: 0.45,
    spm: [6, 5, 4.5, 4, 3.5],
    summary: 'Rook to the 4th rank, king out, block the checks with your rook.',
    tips: [
      'Your king is in front of its own pawn on the 7th and the enemy king is cut off. You win by "building a bridge".',
      'Step 1: lift your rook to the 4th rank (from your side).',
      'Step 2: walk your king out, away from the side the enemy king is on.',
      'Step 3: when the rook checks, walk your king down toward your rook; when the checks run out, block with the rook.',
      'Keep the defending king cut off by at least one file the whole time.',
    ],
  },
  {
    id: 'philidor',
    targetRating: 1400,
    name: 'Philidor Defence',
    material: 'Rook vs rook + pawn (draw)',
    tier: 3,
    basePoints: 30,
    goal: 'hold',
    role: 'defender',
    thinkFactor: 1.4,
    holdMoves: [8, 10, 12, 12, 14],
    spm: [6, 5, 4.5, 4, 3.5],
    summary: 'Third-rank defence, then check from behind once the pawn advances.',
    tips: [
      'Keep your king on or in front of the queening square.',
      'Put your rook on your 3rd rank (the 6th rank if you are Black) to stop the enemy king coming forward.',
      'The moment the pawn steps onto your 3rd rank, drop the rook to the back end of the board and check from behind - the king has no shelter.',
      'Do not let your rook go passive on the back rank too early.',
    ],
  },
  {
    id: 'kqkr',
    targetRating: 2000,
    name: 'Queen vs Rook',
    material: 'King + queen vs king + rook',
    tier: 4,
    basePoints: 45,
    goal: 'convert',
    role: 'attacker',
    thinkFactor: 1.6,
    goalFraction: 0.85,
    spm: [7, 6, 5, 4.5, 4],
    summary: 'Drive the king to the edge, separate king and rook, then fork or mate.',
    tips: [
      'Bring your king up - the queen alone cannot win this.',
      'The defender wants the rook next to its king. Your goal is to force them apart.',
      'Watch every check for a queen fork of king and rook.',
      'Beware rook checks and stalemate tricks; keep your king out of skewers.',
      'Sometimes the winning move is a waiting move with the queen that hands the defender the move.',
    ],
  },
  {
    id: 'kbnk',
    targetRating: 2000,
    name: 'Bishop + Knight Mate',
    material: 'King + bishop + knight vs king',
    tier: 4,
    basePoints: 50,
    goal: 'mate',
    role: 'attacker',
    thinkFactor: 1.6,
    spm: [6, 5, 4.5, 4, 3.5],
    summary: 'Edge, then the bishop-coloured corner. The knight\'s W-manoeuvre does the herding.',
    tips: [
      'Mate is only possible in a corner of the same colour as your bishop.',
      'First drive the king to the edge with all three pieces working together.',
      'If it runs to the wrong corner, the knight does a "W" path to herd it along the edge toward the right corner.',
      'You have 50 moves (and perfect play needs up to 33). Efficiency matters.',
    ],
  },
];

export const DRILL_BY_ID = Object.fromEntries(DRILLS.map((d) => [d.id, d]));

export function getDrill(id) {
  const d = DRILL_BY_ID[id];
  if (!d) throw new Error(`Unknown drill: ${id}`);
  return d;
}

/** Levels 4 and 5 reuse the level-3 position pool. */
export function bankLevel(level) {
  return Math.min(3, Math.max(1, level));
}

/** Optimal moves to mate for the side to move, from a DTM in plies. */
export function movesFromDtm(dtmPlies) {
  if (dtmPlies == null) return null;
  return Math.ceil(Math.abs(dtmPlies) / 2);
}

/**
 * Estimated number of user moves to reach the drill goal with good play.
 * For mates this is exact (DTM). For promote/convert it scales DTM down
 * because the goal is reached before mate.
 */
export function goalMovesEstimate(drill, puzzle, level) {
  if (drill.goal === 'hold') return holdMovesFor(drill, level);
  const toMate = puzzle.mateIn ?? 10;
  if (drill.goal === 'mate') return toMate;
  return Math.max(3, Math.round(toMate * (drill.goalFraction ?? 0.6)));
}

export function holdMovesFor(drill, level) {
  return drill.holdMoves[Math.min(drill.holdMoves.length, level) - 1];
}

/** Par time in seconds for a puzzle at a level. */
export function parSeconds(drill, puzzle, level) {
  const spm = drill.spm[Math.min(drill.spm.length, level) - 1];
  const moves = goalMovesEstimate(drill, puzzle, level);
  return Math.round(5 + spm * moves * drill.thinkFactor);
}

/**
 * Maximum number of user moves before the attempt fails. Generous at first
 * (you may waste up to ~75% extra moves), never beyond the 50-move rule.
 */
export function moveCap(drill, puzzle) {
  if (drill.goal === 'hold') return Infinity;
  if (drill.capMoves) return drill.capMoves;
  const opt = puzzle.mateIn ?? 20;
  return Math.min(50, opt + Math.max(8, Math.ceil(opt * 0.75)));
}
