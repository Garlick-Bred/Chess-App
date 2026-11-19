#!/usr/bin/env node
// Builds shared/puzzles.json: random positions for every drill, each one
// verified against the Lichess endgame tablebase (exact result + distance to
// mate), filtered for being non-trivial, de-duplicated under board symmetry,
// and split into three difficulty levels.
//
//   node scripts/generate-puzzles.mjs [perDrill=60] [drillId ...]
//
// Behind an HTTPS proxy on Node >= 22.21, run with NODE_USE_ENV_PROXY=1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { DRILLS } from '../shared/drills.js';
import { outcomeOf, moverOutcome } from '../shared/grading.js';
import { PAWNLESS_TRANSFORMS, PAWN_TRANSFORMS, transformFen, hasPawns } from '../shared/symmetry.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'shared', 'puzzles.json');
const CACHE_FILE = path.join(ROOT, 'scripts', '.cache', 'tb.json');
const PER_DRILL = Number(process.argv[2] ?? 60);
const ONLY = process.argv.slice(3);

fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
let probes = 0;

async function probe(fen) {
  if (cache[fen]) return cache[fen];
  const url = `https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(fen)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'garlick-endgames-puzzle-generator/0.1' } });
      if (res.status === 429) {
        console.log('  rate limited, waiting 60s');
        await sleep(60000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const slim = {
        category: d.category,
        dtm: d.dtm,
        dtz: d.dtz,
        moves: d.moves.map((m) => ({ uci: m.uci, san: m.san, category: m.category, dtm: m.dtm, dtz: m.dtz })),
      };
      cache[fen] = slim;
      probes++;
      if (probes % 50 === 0) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
      await sleep(250);
      return slim;
    } catch (e) {
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`tablebase unreachable for ${fen}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (n) => Math.floor(Math.random() * n);
const pick = (xs) => xs[rnd(xs.length)];
const FILES = 'abcdefgh';
const sq = (f, r) => FILES[f] + (r + 1); // f,r 0-based; r=0 is rank 1
const sqColor = (f, r) => (f + r) % 2; // 0 = dark
const kingDist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

function buildFen(pieces, turn) {
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [p, f, r] of pieces) {
    if (grid[7 - r][f]) return null;
    grid[7 - r][f] = p;
  }
  const rows = grid.map((row) => {
    let s = '';
    let e = 0;
    for (const c of row) {
      if (!c) e++;
      else {
        if (e) s += e;
        e = 0;
        s += c;
      }
    }
    return s + (e ? e : '');
  });
  return `${rows.join('/')} ${turn} - - 0 1`;
}

/** Legal: no overlaps, kings apart, side NOT to move is not in check. */
function legal(fen, { allowCheck = false } = {}) {
  if (!fen) return false;
  try {
    const c = new Chess(fen);
    const flipped = fen.replace(/ ([wb]) /, (_, t) => ` ${t === 'w' ? 'b' : 'w'} `);
    const other = new Chess(flipped, { skipValidation: true });
    if (other.inCheck()) return false;
    if (!allowCheck && c.inCheck()) return false;
    if (c.isGameOver()) return false;
    return true;
  } catch {
    return false;
  }
}

const randSq = () => [rnd(8), rnd(8)];

// ---- position samplers per drill -------------------------------------------
const SAMPLERS = {
  kqk: () => [['K', ...randSq()], ['Q', ...randSq()], ['k', ...randSq()]],
  krk: () => [['K', ...randSq()], ['R', ...randSq()], ['k', ...randSq()]],
  krrk: () => [['K', ...randSq()], ['R', ...randSq()], ['R', ...randSq()], ['k', ...randSq()]],
  kbbk: () => {
    const b1 = randSq();
    let b2;
    do b2 = randSq();
    while (sqColor(...b2) === sqColor(...b1));
    return [['K', ...randSq()], ['B', ...b1], ['B', ...b2], ['k', ...randSq()]];
  },
  kbnk: () => [['K', ...randSq()], ['B', ...randSq()], ['N', ...randSq()], ['k', ...randSq()]],
  kqkr: () => [['K', ...randSq()], ['Q', ...randSq()], ['k', ...randSq()], ['r', ...randSq()]],
  kqkp: () => {
    const pf = pick([1, 3, 4, 6]); // b, d, e, g pawns - the winning files
    const p = [pf, 1]; // black pawn on its 7th rank (rank 2)
    let bk;
    do bk = [pf + rnd(3) - 1, rnd(3)];
    while (bk[0] < 0 || bk[0] > 7 || (bk[0] === p[0] && bk[1] === p[1]));
    let wk;
    do wk = randSq();
    while (kingDist(wk, p) < 4);
    return [['K', ...wk], ['Q', ...randSq()], ['k', ...bk], ['p', ...p]];
  },
  'kpk-win': () => {
    const pf = 1 + rnd(6);
    const p = [pf, 1 + rnd(4)]; // ranks 2-5
    const wk = [clamp(pf + rnd(5) - 2), clamp(p[1] + rnd(4) - 1)];
    const bk = [clamp(pf + rnd(5) - 2), clamp(p[1] + 1 + rnd(4))];
    return [['K', ...wk], ['P', ...p], ['k', ...bk]];
  },
  'kpk-draw': () => {
    const pf = Math.random() < 0.15 ? pick([0, 7]) : 1 + rnd(6);
    const p = [pf, 1 + rnd(5)]; // ranks 2-6
    const wk = [clamp(pf + rnd(3) - 1), clamp(p[1] + rnd(3) - 1)];
    const bk = [clamp(pf + rnd(3) - 1), clamp(p[1] + 1 + rnd(3))];
    return [['K', ...wk], ['P', ...p], ['k', ...bk]];
  },
  lucena: () => {
    const x = 1 + rnd(6); // pawn file b-g
    const dir = pick([-1, 1]);
    const d = 2 + rnd(2);
    const bkf = x + dir * d;
    if (bkf < 0 || bkf > 7) return null;
    const bk = [bkf, 4 + rnd(4)];
    const wr = [x + dir * (1 + rnd(d - 1)), rnd(4)]; // rook cutting on a file between
    const brf = x - dir * (1 + rnd(3));
    if (brf < 0 || brf > 7) return null;
    const br = [brf, rnd(4)];
    return [['K', x, 7], ['P', x, 6], ['R', ...wr], ['k', ...bk], ['r', ...br]];
  },
  philidor: () => {
    const x = 1 + rnd(6);
    const p = [x, 3 + rnd(2)]; // rank 4-5
    const wk = [clamp(x + rnd(3) - 1), p[1] + rnd(2)];
    const bk = [clamp(x + rnd(3) - 1), 7];
    const br = [rnd(8), 5]; // third-rank defence (rank 6)
    const wr = [rnd(8), rnd(7)];
    return [['K', ...wk], ['P', ...p], ['R', ...wr], ['k', ...bk], ['r', ...br]];
  },
};
const clamp = (v) => Math.max(0, Math.min(7, v));

// Defender-to-move drills: the user is Black in the stored position.
const TURN = { 'kpk-draw': 'b', philidor: 'b' };
const MIN_MATE = { kqk: 2, krk: 3, krrk: 2, kbbk: 4, kbnk: 6, kqkr: 4, kqkp: 4, 'kpk-win': 3, lucena: 4 };

function canonical(fen) {
  const pool = hasPawns(fen) ? PAWN_TRANSFORMS : PAWNLESS_TRANSFORMS;
  return pool.map((t) => transformFen(fen, t)).sort()[0];
}

async function generate(drill) {
  const sampler = SAMPLERS[drill.id];
  const turn = TURN[drill.id] ?? 'w';
  const want = drill.role === 'attacker' ? 'win' : 'draw';
  const seen = new Set();
  const out = [];
  let tries = 0;
  while (out.length < PER_DRILL && tries < PER_DRILL * 400) {
    tries++;
    const pieces = sampler();
    if (!pieces) continue;
    if (pieces.some(([p, f, r]) => f < 0 || f > 7 || r < 0 || r > 7 || (/p/i.test(p) && (r === 0 || r === 7)))) continue;
    const fen = buildFen(pieces, turn);
    if (!legal(fen)) continue;
    const key = canonical(fen);
    if (seen.has(key)) continue;
    seen.add(key);
    const tb = await probe(fen);
    if (outcomeOf(tb.category) !== want) continue;
    const keeping = tb.moves.filter((m) => moverOutcome(m.category) === want);
    const throwing = tb.moves.length - keeping.length;
    // Nothing can go wrong = not a puzzle. (Two rooks are the exception: losing
    // one still wins, so that drill is purely about speed.)
    if (throwing === 0 && drill.id !== 'krrk') continue;
    const mateIn = tb.dtm != null ? Math.ceil(Math.abs(tb.dtm) / 2) : null;
    if (want === 'win') {
      if (mateIn == null || mateIn < (MIN_MATE[drill.id] ?? 2)) continue;
      // Skip positions that start with a free capture (trivial conversions).
      if ((drill.id === 'kqkr' || drill.id === 'kqkp') && keeping.some((m) => m.san.includes('x'))) continue;
    }
    out.push({ fen, mateIn, holding: keeping.length });
    process.stdout.write(`\r  ${drill.id}: ${out.length}/${PER_DRILL} (tries ${tries}, probes ${probes})   `);
  }
  process.stdout.write('\n');
  // Difficulty: longer mates are harder; when defending (or escorting a pawn),
  // fewer result-keeping moves are harder.
  const hardness = (p) =>
    drill.goal === 'hold' ? -p.holding * 100 + Math.random() : drill.id === 'kpk-win' ? -p.holding * 100 + (p.mateIn ?? 0) : p.mateIn ?? 0;
  out.sort((a, b) => hardness(a) - hardness(b));
  const third = Math.ceil(out.length / 3);
  out.forEach((p, i) => (p.level = Math.min(3, Math.floor(i / third) + 1)));
  return out;
}

async function main() {
  const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { drills: {} };
  const drills = ONLY.length ? DRILLS.filter((d) => ONLY.includes(d.id)) : DRILLS;
  for (const d of drills) {
    console.log(`Generating ${d.id}...`);
    existing.drills[d.id] = await generate(d);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    const lv = [1, 2, 3].map((l) => existing.drills[d.id].filter((p) => p.level === l));
    console.log(
      `  levels: ${lv.map((x, i) => `L${i + 1}=${x.length} (mate ${Math.min(...x.map((p) => p.mateIn ?? 0))}-${Math.max(...x.map((p) => p.mateIn ?? 0))}, holding ${Math.min(...x.map((p) => p.holding))}-${Math.max(...x.map((p) => p.holding))})`).join('  ')}`,
    );
  }
  existing.version = 1;
  existing.generatedAt = new Date().toISOString();
  existing.source = 'Lichess tablebase (Syzygy + Gaviota DTM)';
  fs.writeFileSync(OUT, JSON.stringify(existing));
  console.log(`Wrote ${OUT} (${probes} new tablebase probes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
