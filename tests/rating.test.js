import { describe, it, expect } from 'vitest';
import { puzzleRating, solveScore, rateAttempt, expectedScore, kFactor } from '../shared/rating.js';
import { getDrill } from '../shared/drills.js';

const lucena = getDrill('lucena'); // target 1400
const krrk = getDrill('krrk'); // target 400

describe('endgame rating', () => {
  it('rates puzzles by drill and level', () => {
    expect(puzzleRating(lucena, 2)).toBe(1400);
    expect(puzzleRating(lucena, 1)).toBe(1300);
    expect(puzzleRating(lucena, 5)).toBeGreaterThan(puzzleRating(lucena, 3));
  });
  it('scores help and sloppy play as partial solves', () => {
    expect(solveScore({ success: false })).toBe(0);
    expect(solveScore({ success: true })).toBe(1);
    expect(solveScore({ success: true, writtenHints: 1 })).toBe(0.75);
    expect(solveScore({ success: true, takebacks: 2 })).toBe(0.5);
    expect(solveScore({ success: true, efficiency: 0.3 })).toBe(0.75);
    expect(solveScore({ success: true, efficiency: 0.3, goal: 'hold' })).toBe(1);
  });
  it('gains more for harder puzzles and nothing for very easy ones', () => {
    const hard = rateAttempt({ rating: 1200, games: 30, puzzle: 1600, score: 1 });
    const even = rateAttempt({ rating: 1200, games: 30, puzzle: 1200, score: 1 });
    const easy = rateAttempt({ rating: 1200, games: 30, puzzle: puzzleRating(krrk, 3), score: 1 });
    expect(hard.delta).toBeGreaterThan(even.delta);
    expect(even.delta).toBe(14); // 28 * 0.5
    expect(easy.delta).toBe(0);
  });
  it('loses more for failing easy puzzles than hard ones', () => {
    const failEasy = rateAttempt({ rating: 1200, games: 30, puzzle: 900, score: 0 });
    const failHard = rateAttempt({ rating: 1200, games: 30, puzzle: 1700, score: 0 });
    expect(failEasy.delta).toBeLessThan(failHard.delta);
    expect(failHard.delta).toBeLessThan(0);
  });
  it('is pulled gently toward your chess rating without flipping a result', () => {
    const above = rateAttempt({ rating: 1500, games: 60, puzzle: 1500, score: 1, anchor: 1200 });
    const plain = rateAttempt({ rating: 1500, games: 60, puzzle: 1500, score: 1 });
    expect(above.delta).toBeLessThan(plain.delta);
    expect(above.delta).toBeGreaterThanOrEqual(0);
    const failBelow = rateAttempt({ rating: 900, games: 60, puzzle: 900, score: 0, anchor: 1200 });
    expect(failBelow.delta).toBeLessThanOrEqual(0);
  });
  it('moves faster while the rating is new', () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(100));
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });
});
