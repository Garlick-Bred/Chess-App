import { describe, it, expect } from 'vitest';
import { gradeMove, gradeForWaste, bestMoves, pickComputerMove, isStalling, efficiency, outcomeOf, positionDistance } from '../shared/grading.js';

// A KR vs K position, White to move, mate in 14 (27 plies).
const winning = {
  category: 'win',
  dtm: 27,
  moves: [
    { uci: 'h1h5', category: 'loss', dtm: -26, dtz: -26 },
    { uci: 'e1d2', category: 'loss', dtm: -26, dtz: -26 },
    { uci: 'h1h2', category: 'loss', dtm: -28, dtz: -28 },
    { uci: 'h1g1', category: 'loss', dtm: -30, dtz: -30 },
    { uci: 'h1a1', category: 'loss', dtm: -34, dtz: -34 },
    { uci: 'h1h8', category: 'draw', dtm: null, dtz: 0 },
  ],
};

describe('gradeMove', () => {
  it('rates DTM-optimal moves as best', () => {
    expect(gradeMove(winning, 'h1h5').grade).toBe('best');
    expect(gradeMove(winning, 'e1d2').wastePlies).toBe(0);
  });
  it('rates a move one full move slower as good (keeps the win, no progress)', () => {
    const g = gradeMove(winning, 'h1h2');
    expect(g.grade).toBe('good');
    expect(g.wastePlies).toBe(2);
  });
  it('rates going backwards as inaccuracy, far backwards as mistake', () => {
    expect(gradeMove(winning, 'h1g1').grade).toBe('inaccuracy');
    expect(gradeMove(winning, 'h1a1').grade).toBe('mistake');
  });
  it('flags a result change as a blunder and returns the best moves', () => {
    const g = gradeMove(winning, 'h1h8');
    expect(g.grade).toBe('blunder');
    expect(g.after).toBe('draw');
    expect(g.bestUci).toEqual(['h1h5', 'e1d2']);
  });
  it('never charges waste for a move that completes the goal', () => {
    expect(gradeMove(winning, 'h1a1', { reachesGoal: true }).grade).toBe('best');
  });
  it('treats every drawing move as fine when defending and rewards the only move', () => {
    const defending = {
      category: 'draw',
      moves: [
        { uci: 'e8d8', category: 'draw', dtm: null, dtz: 0 },
        { uci: 'e8f8', category: 'win', dtm: 21, dtz: 21 },
        { uci: 'e8f7', category: 'win', dtm: 19, dtz: 19 },
      ],
    };
    expect(gradeMove(defending, 'e8d8').grade).toBe('only');
    expect(gradeMove(defending, 'e8f8').grade).toBe('blunder');
    expect(gradeMove(defending, 'e8f8').after).toBe('loss');
  });
  it('falls back to DTZ when DTM is missing and counts zeroing moves as progress', () => {
    const six = {
      category: 'win',
      moves: [
        { uci: 'a', category: 'loss', dtm: null, dtz: -10 },
        { uci: 'b', category: 'loss', dtm: null, dtz: -16 },
        { uci: 'c', category: 'loss', dtm: null, dtz: -30, zeroing: true },
      ],
    };
    expect(gradeMove(six, 'b').metric).toBe('dtz');
    expect(gradeMove(six, 'b').grade).toBe('inaccuracy');
    expect(gradeMove(six, 'c').grade).toBe('best');
  });
  it('treats 50-move-rule results as draws', () => {
    expect(outcomeOf('cursed-win')).toBe('draw');
    expect(outcomeOf('blessed-loss')).toBe('draw');
  });
});

describe('thresholds', () => {
  it('maps waste plies to grades', () => {
    expect([0, 2, 4, 6, 8].map(gradeForWaste)).toEqual(['best', 'good', 'inaccuracy', 'inaccuracy', 'mistake']);
  });
});

describe('computer replies', () => {
  it('losing side resists as long as possible', () => {
    const losing = {
      category: 'loss',
      dtm: -22,
      moves: [
        { uci: 'x1', category: 'win', dtm: 21 },
        { uci: 'x2', category: 'win', dtm: 19 },
        { uci: 'x3', category: 'win', dtm: 21 },
      ],
    };
    const picks = new Set(Array.from({ length: 30 }, () => pickComputerMove(losing).uci));
    expect([...picks].sort()).toEqual(['x1', 'x3']);
  });
  it('drawing side never picks a losing move', () => {
    const drawn = {
      category: 'draw',
      moves: [
        { uci: 'p', category: 'draw' },
        { uci: 'q', category: 'win' },
      ],
    };
    for (let i = 0; i < 20; i++) expect(pickComputerMove(drawn).uci).toBe('p');
  });
  it('bestMoves for the winner are the shortest wins', () => {
    expect(bestMoves(winning).map((m) => m.uci)).toEqual(['h1h5', 'e1d2']);
  });
});

describe('progress tracking', () => {
  it('detects stalling over the window', () => {
    expect(isStalling([27, 25, 23, 21, 19, 17])).toBe(false);
    expect(isStalling([21, 21, 23, 21, 21, 21])).toBe(true);
    expect(isStalling([21, 21, 21])).toBe(false);
  });
  it('computes efficiency from wasted plies', () => {
    expect(efficiency(10, 0)).toBe(1);
    expect(efficiency(10, 4)).toBeCloseTo(0.8);
    expect(efficiency(0, 0)).toBe(1);
  });
  it('reads position distance from DTM, then DTZ', () => {
    expect(positionDistance({ dtm: -22 })).toBe(22);
    expect(positionDistance({ dtm: null, dtz: 7 })).toBe(7);
  });
});
