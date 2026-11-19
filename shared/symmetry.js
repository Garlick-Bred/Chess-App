// Board symmetries that preserve the theoretical result, used to turn each
// stored puzzle into several different-looking positions.
//   - Pawnless positions: all 8 rotations/reflections of the board.
//   - Positions with pawns: only the left-right mirror.
//   - Any position: swap colours (mirror ranks, swap piece colours, swap side to move).

function parseBoard(fen) {
  const [placement, turn] = fen.split(' ');
  const grid = [];
  for (const row of placement.split('/')) {
    const r = [];
    for (const ch of row) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) r.push(null);
      else r.push(ch);
    }
    grid.push(r); // grid[0] = rank 8
  }
  return { grid, turn };
}

function toFen(grid, turn) {
  const rows = grid.map((r) => {
    let s = '';
    let empty = 0;
    for (const c of r) {
      if (!c) empty++;
      else {
        if (empty) s += empty;
        empty = 0;
        s += c;
      }
    }
    if (empty) s += empty;
    return s;
  });
  return `${rows.join('/')} ${turn} - - 0 1`;
}

const T = {
  identity: (f, r) => [f, r],
  flipFiles: (f, r) => [7 - f, r],
  flipRanks: (f, r) => [f, 7 - r],
  rot180: (f, r) => [7 - f, 7 - r],
  transpose: (f, r) => [r, f],
  antiTranspose: (f, r) => [7 - r, 7 - f],
  rot90: (f, r) => [r, 7 - f],
  rot270: (f, r) => [7 - r, f],
};

export const PAWNLESS_TRANSFORMS = Object.keys(T);
export const PAWN_TRANSFORMS = ['identity', 'flipFiles'];

export function transformFen(fen, name) {
  const { grid, turn } = parseBoard(fen);
  const out = Array.from({ length: 8 }, () => Array(8).fill(null));
  const fn = T[name];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const [nf, nr] = fn(f, r);
      out[nr][nf] = grid[r][f];
    }
  }
  return toFen(out, turn);
}

export function swapColors(fen) {
  const { grid, turn } = parseBoard(fen);
  const out = grid
    .slice()
    .reverse()
    .map((row) => row.map((c) => (c ? (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()) : null)));
  return toFen(out, turn === 'w' ? 'b' : 'w');
}

export function hasPawns(fen) {
  return /p/i.test(fen.split(' ')[0]);
}

/**
 * Random result-preserving variant of a position.
 * @param {string} fen
 * @param {'white'|'black'|'random'} playAs  colour the user wants (side to move = user)
 * @param {() => number} rng
 */
export function randomVariant(fen, playAs = 'random', rng = Math.random) {
  const pool = hasPawns(fen) ? PAWN_TRANSFORMS : PAWNLESS_TRANSFORMS;
  let out = transformFen(fen, pool[Math.floor(rng() * pool.length)]);
  const want = playAs === 'random' ? (rng() < 0.5 ? 'w' : 'b') : playAs === 'white' ? 'w' : 'b';
  if (out.split(' ')[1] !== want) out = swapColors(out);
  return out;
}
