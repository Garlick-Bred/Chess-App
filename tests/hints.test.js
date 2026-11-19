import { describe, it, expect } from 'vitest';
import { kingRegion, analyseMove, writtenHint, bestExplained, attackerColor } from '../shared/hints.js';
import { getDrill } from '../shared/drills.js';

const krk = getDrill('krk');
const krrk = getDrill('krrk');
const kpkDraw = getDrill('kpk-draw');

describe('king box', () => {
  it('measures the squares the defending king can reach', () => {
    // A protected rook on a6 fences the king into ranks 7-8, minus the a-file (14 squares).
    expect(kingRegion('4k3/8/R7/1K6/8/8/8/8 b - - 0 1', 'b').size).toBe(14);
    // An undefended rook doesn't close the box: the king can walk over and take it.
    expect(kingRegion('4k3/8/R7/8/8/8/8/4K3 b - - 0 1', 'b').size).toBeGreaterThan(14);
    // Lone kings: everything except squares next to the attacking king.
    expect(kingRegion('4k3/8/8/8/8/8/8/4K3 b - - 0 1', 'b').size).toBe(64 - 6);
  });
  it('picks the side with more material as the attacker', () => {
    expect(attackerColor('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')).toBe('w');
    expect(attackerColor('4k3/4r3/8/8/8/8/8/4K3 w - - 0 1')).toBe('b');
  });
});

describe('move analysis', () => {
  const fen = '8/8/3k4/8/8/8/1R6/K6R w - - 0 1';
  it('recognises cutting off, checks that drive the king back, and mate', () => {
    expect(analyseMove(fen, 'h1h5', krrk).concept).toBe('cut');
    expect(analyseMove(fen, 'h1h6', krrk).concept).toBe('check-drive');
    expect(analyseMove('k7/2R5/8/8/8/8/8/K6R w - - 0 1', 'h1h8', krrk).concept).toBe('mate');
  });
  it('recognises opposition and the defender stepping back in pawn endings', () => {
    // White king e3 -> e4 faces the black king on e6 with one square between.
    expect(analyseMove('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 'e3e4', kpkDraw).concept).toBe('opposition');
    expect(analyseMove('8/8/4k3/8/4K3/8/4P3/8 b - - 0 1', 'e6e7', kpkDraw).concept).toBe('back');
  });
  it('describes a king move that closes the box as guarding the rook', () => {
    const a = analyseMove('4k3/8/R7/2K5/8/8/8/8 w - - 0 1', 'c5b5', krk);
    expect(a.concept).toBe('cut');
    expect(a.text).toMatch(/^Guards your rook/);
  });
  it('explains moves in plain words', () => {
    expect(analyseMove(fen, 'h1h5', krrk).text).toMatch(/box shrinks from \d+ to \d+ squares/);
  });
});

describe('written hints', () => {
  // A hand-built tablebase answer: two equally perfect moves, one a check, one a cut.
  const fen = '8/8/3k4/8/8/8/1R6/K6R w - - 0 1';
  const tb = {
    category: 'win',
    dtm: 9,
    moves: [
      { uci: 'h1h6', san: 'Rh6+', category: 'loss', dtm: -8, dtz: -8 },
      { uci: 'h1h5', san: 'Rh5', category: 'loss', dtm: -8, dtz: -8 },
      { uci: 'a1a2', san: 'Ka2', category: 'loss', dtm: -12, dtz: -12 },
      { uci: 'b2b6', san: 'Rb6+', category: 'loss', dtm: -10, dtz: -10 },
      { uci: 'h1h8', san: 'Rh8', category: 'draw', dtm: null, dtz: 0, stalemate: false },
    ],
  };
  it('describes the idea of a perfect move without naming it', () => {
    const text = writtenHint(fen, tb, krrk);
    expect(text).toMatch(/cut off the king/i);
    expect(text).not.toMatch(/Rh5|h5/);
  });
  it('prefers the most explainable of equally perfect moves', () => {
    expect(bestExplained(fen, tb, krrk).analysis.concept).toBe('cut');
  });
  it('warns about stalemate traps and only-moves', () => {
    const trap = { ...tb, moves: [...tb.moves.slice(0, 1), { uci: 'b2b7', san: 'Rb7', category: 'draw', stalemate: true }, ...tb.moves.slice(2)] };
    expect(writtenHint(fen, trap, krk)).toMatch(/stalemate/i);
  });
});
