import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { transformFen, swapColors, randomVariant, PAWNLESS_TRANSFORMS } from '../shared/symmetry.js';
import { DRILLS } from '../shared/drills.js';
import bank from '../shared/puzzles.json';

const count = (fen) => fen.split(' ')[0].replace(/[\d/]/g, '').split('').sort().join('');

describe('symmetry', () => {
  const fen = '8/8/4k3/8/8/8/2Q5/K7 w - - 0 1'; // no symmetry axis
  it('keeps the same pieces under every board transform', () => {
    for (const t of PAWNLESS_TRANSFORMS) expect(count(transformFen(fen, t))).toBe(count(fen));
  });
  it('produces 8 distinct boards for an asymmetric position', () => {
    expect(new Set(PAWNLESS_TRANSFORMS.map((t) => transformFen(fen, t).split(' ')[0])).size).toBe(8);
  });
  it('colour swap flips side to move and is its own inverse', () => {
    const s = swapColors(fen);
    expect(s.split(' ')[1]).toBe('b');
    expect(swapColors(s)).toBe(fen);
  });
  it('random variants put the requested colour to move', () => {
    for (let i = 0; i < 20; i++) {
      expect(randomVariant(fen, 'black').split(' ')[1]).toBe('b');
      expect(randomVariant(fen, 'white').split(' ')[1]).toBe('w');
    }
  });
  it('pawn positions are only mirrored left-right', () => {
    const p = '8/8/8/8/3k4/8/3P4/3K4 w - - 0 1';
    for (let i = 0; i < 20; i++) {
      const v = randomVariant(p, 'white');
      expect(v.split(' ')[0].split('/')[6]).toMatch(/P/); // pawn stays on rank 2
    }
  });
});

describe('puzzle bank', () => {
  for (const d of DRILLS) {
    describe(d.id, () => {
      const list = bank.drills[d.id] ?? [];
      it('has positions at every level', () => {
        for (const l of [1, 2, 3]) expect(list.filter((p) => p.level === l).length).toBeGreaterThan(0);
      });
      it('every position is legal and the user (side to move) has the right role', () => {
        for (const p of list) {
          const c = new Chess(p.fen);
          expect(c.isGameOver()).toBe(false);
          const turn = p.fen.split(' ')[1];
          expect(turn).toBe(d.role === 'attacker' ? 'w' : 'b');
          if (d.goal !== 'hold') expect(p.mateIn).toBeGreaterThan(0);
        }
      });
    });
  }
});
