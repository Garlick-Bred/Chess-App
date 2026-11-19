// Written hints and lesson commentary, grounded in the tablebase's best move.
// Nothing here guesses: we take a move the tablebase says is perfect, work
// out what it *does* (cuts the king off, checks it back, takes the opposition,
// waits, ...) and put that idea into words.
import { Chess } from 'chess.js';
import { bestMoves, moverOutcome, outcomeOf } from './grading.js';

const FILES = 'abcdefgh';
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const sqXY = (s) => [FILES.indexOf(s[0]), Number(s[1]) - 1];
const xySq = (x, y) => FILES[x] + (y + 1);
const kingDist = (a, b) => {
  const [ax, ay] = sqXY(a);
  const [bx, by] = sqXY(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
};

export function findKing(chess, color) {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

/** The side with more material is the attacker (true for every drill). */
export function attackerColor(fen) {
  let w = 0;
  let b = 0;
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (!(t in VALUE)) continue;
    if (ch === t) b += VALUE[t];
    else w += VALUE[t];
  }
  return w >= b ? 'w' : 'b';
}

/**
 * The defending king's "box": every square it could walk to through squares
 * the attacker does not control (the king itself removed so it doesn't block
 * x-rays). Used to explain cutting-off moves and to shade lessons.
 */
export function kingRegion(fen, defender) {
  let c;
  try {
    c = new Chess(fen, { skipValidation: true });
  } catch {
    return new Set();
  }
  const k = findKing(c, defender);
  if (!k) return new Set();
  c.remove(k);
  const attacker = defender === 'w' ? 'b' : 'w';
  const seen = new Set([k]);
  const stack = [k];
  while (stack.length) {
    const [x, y] = sqXY(stack.pop());
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || nx > 7 || ny < 0 || ny > 7) continue;
        const n = xySq(nx, ny);
        if (seen.has(n)) continue;
        const p = c.get(n);
        if (p && p.color === defender) continue;
        if (c.isAttacked(n, attacker)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen;
}

const hasPawns = (fen) => /p/i.test(fen.split(' ')[0]);
const isOpposition = (a, b) => {
  const [ax, ay] = sqXY(a);
  const [bx, by] = sqXY(b);
  return (ax === bx && Math.abs(ay - by) === 2) || (ay === by && Math.abs(ax - bx) === 2);
};

/**
 * What a move does, as a concept tag plus one sentence.
 * @returns {{ concept: string, text: string, piece: string, san: string }}
 */
/** The attacker's first non-king, non-pawn piece type (for wording). */
function otherPiece(c, color) {
  for (const row of c.board()) for (const sq of row) if (sq && sq.color === color && sq.type !== 'k' && sq.type !== 'p') return sq.type;
  return null;
}

export function analyseMove(fenBefore, uci, drill) {
  const c = new Chess(fenBefore);
  const mover = c.turn();
  const attacker = attackerColor(fenBefore);
  const legalCount = c.moves().length;
  const move = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const fenAfter = c.fen();
  const piece = move.piece;
  const out = (concept, text) => ({ concept, text, piece: NAME[piece], san: move.san });

  if (c.isCheckmate()) return out('mate', 'Checkmate!');
  if (c.isStalemate()) return out('stalemate', 'Stalemate: the king has no legal move, so it is a draw.');

  if (mover === attacker) {
    const defender = mover === 'w' ? 'b' : 'w';
    const defKing = findKing(c, defender);
    const pawns = hasPawns(fenBefore);
    if (move.promotion) return out('promote', 'Promotes the pawn. The new queen wins easily.');
    if (move.captured) return out('capture', `Wins the ${NAME[move.captured]}.`);
    if (drill?.id === 'lucena' && piece === 'r') {
      const rank = Number(move.to[1]);
      if ((mover === 'w' && rank === 4) || (mover === 'b' && rank === 5)) {
        return out('bridge', 'Builds the bridge: the rook goes to the 4th rank, ready to block checks.');
      }
    }
    if (piece === 'p') return out('pawn-push', 'Pushes the pawn forward.');
    const check = c.inCheck();
    if (!pawns) {
      const before = kingRegion(fenBefore, defender).size;
      const after = kingRegion(fenAfter, defender).size;
      if (after < before) {
        return check
          ? out('check-drive', `Check! The king is driven back: its box shrinks from ${before} to ${after} squares.`)
          : piece === 'k'
            ? out('cut', `Guards your ${NAME[otherPiece(c, mover)] ?? 'piece'} so the box closes: it shrinks from ${before} to ${after} squares.`)
            : out('cut', `Cuts the king off: its box shrinks from ${before} to ${after} squares.`);
      }
      if (piece !== 'k' && !check && after === before) {
        return out('waiting', 'A waiting move: the box stays shut and the other side has to move.');
      }
    }
    if (piece === 'k' && defKing) {
      if (isOpposition(move.to, defKing)) return out('opposition', 'Takes the opposition: the kings face each other with one square between.');
      if (kingDist(move.to, defKing) < kingDist(move.from, defKing)) {
        return out('king-approach', pawns ? 'Leads with the king, supporting the pawn.' : 'Brings the king closer to help.');
      }
      return out('king', 'Repositions the king.');
    }
    if (check) return out('check', `Check with the ${NAME[piece]}.`);
    return out('move', `${NAME[piece][0].toUpperCase()}${NAME[piece].slice(1)} to ${move.to}.`);
  }

  // Defender's move.
  if (legalCount === 1) return out('forced', 'The only legal move.');
  const atk = attacker;
  const atkKing = findKing(c, atk);
  if (piece === 'k') {
    if (atkKing && isOpposition(move.to, atkKing)) return out('opposition', 'Takes the opposition: the kings face each other with one square between.');
    const back = mover === 'b' ? Number(move.to[1]) > Number(move.from[1]) : Number(move.to[1]) < Number(move.from[1]);
    if (hasPawns(fenBefore) && back && move.to[0] === move.from[0]) {
      return out('back', 'Steps straight back, ready to retake the opposition.');
    }
    const centre = (s) => {
      const [x, y] = sqXY(s);
      return Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
    };
    if (centre(move.to) < centre(move.from)) return out('escape', 'The king heads for the centre, away from the edge.');
    return out('king', 'The king steps aside.');
  }
  if (piece === 'r' && drill?.id === 'philidor') {
    const rank = Number(move.to[1]);
    const third = mover === 'b' ? 6 : 3;
    if (rank === third) return out('third-rank', 'Keeps the rook on the third rank so the enemy king cannot come forward.');
    if (c.inCheck()) return out('check-behind', 'Checks from behind: the king has no shelter from the pawn.');
  }
  if (c.inCheck()) return out('check', `Check with the ${NAME[piece]}.`);
  return out('move', `${NAME[piece][0].toUpperCase()}${NAME[piece].slice(1)} to ${move.to}.`);
}

// Which idea to talk about when several moves are equally perfect.
const PREFERENCE = [
  'mate',
  'promote',
  'capture',
  'bridge',
  'cut',
  'check-drive',
  'opposition',
  'back',
  'third-rank',
  'check-behind',
  'king-approach',
  'waiting',
  'pawn-push',
  'check',
  'king',
  'escape',
  'forced',
  'move',
];
const rank = (concept) => {
  const i = PREFERENCE.indexOf(concept);
  return i < 0 ? PREFERENCE.length : i;
};

/** The most explainable of the perfect moves, with its analysis. */
export function bestExplained(fen, tb, drill) {
  const best = bestMoves(tb).slice(0, 8);
  let pick = null;
  for (const m of best) {
    const a = analyseMove(fen, m.uci, drill);
    if (!pick || rank(a.concept) < rank(pick.analysis.concept)) pick = { uci: m.uci, san: m.san, analysis: a };
  }
  return pick;
}

const HINT = {
  mate: () => "There's a checkmate in one move. Find it!",
  promote: () => 'Your pawn can promote now without losing the win.',
  capture: () => 'There is a capture that wins material and keeps the win.',
  bridge: () => 'Build a bridge: get your rook to your 4th rank so it can block the checks later.',
  cut: (p) => (p === 'king' ? 'Use your king to guard your other pieces, so the box closes.' : `Use your ${p} to cut off the king's escape and shrink its box.`),
  'check-drive': (p) => `A check with your ${p} drives the king back toward the edge.`,
  opposition: () => 'Take the opposition: put your king directly opposite theirs with one square between.',
  back: () => 'Step straight back toward the queening square so you can take the opposition next move.',
  'third-rank': () => "Keep your rook on your third rank so the enemy king can't come forward.",
  'check-behind': () => 'The pawn has advanced: drop your rook back and give checks from behind.',
  'king-approach': (p, pawns) => (pawns ? 'Lead with your king, not the pawn.' : 'Bring your king closer. The other pieces cannot finish the job alone.'),
  waiting: () => 'Make a waiting move: keep the box shut and hand the move to your opponent.',
  'pawn-push': () => 'Your pawn can step forward safely now.',
  check: (p) => `Look for a useful check with your ${p}.`,
};

/**
 * A written hint for the player to move: the idea behind a perfect move,
 * without naming the move. Adds warnings for stalemate traps and positions
 * where almost every move throws the result away.
 */
export function writtenHint(fen, tb, drill) {
  const pick = bestExplained(fen, tb, drill);
  const fallback = drill?.tips?.[0] ?? 'Look for the move that makes progress without letting the result slip.';
  if (!pick) return fallback;
  const f = HINT[pick.analysis.concept];
  let text = f ? f(pick.analysis.piece, hasPawns(fen)) : fallback;
  const moves = tb?.moves ?? [];
  const before = outcomeOf(tb?.category);
  const keeping = moves.filter((m) => moverOutcome(m.category) === before);
  if (pick.analysis.concept !== 'mate' && moves.some((m) => m.stalemate)) text += ' Careful: one of your moves would stalemate the king.';
  if (moves.length > 4 && keeping.length <= 2) text += ` Only ${keeping.length} move${keeping.length === 1 ? '' : 's'} keep${keeping.length === 1 ? 's' : ''} the ${before === 'draw' ? 'draw' : 'win'} here.`;
  return text;
}
