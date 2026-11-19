import { describe, it, expect } from 'vitest';
import { cloveValue, drillFit, startingLevel, formatCloves, validRating } from '../shared/cloves.js';
import { getDrill } from '../shared/drills.js';

describe('clove values', () => {
  const krrk = getDrill('krrk');
  const krk = getDrill('krk');
  const lucena = getDrill('lucena');
  it('classifies drills relative to the player rating', () => {
    expect(drillFit(krrk, 1300)).toBe('warmup');
    expect(drillFit(krk, 1100)).toBe('easy');
    expect(drillFit(lucena, 1300)).toBe('core');
    expect(drillFit(krrk, null)).toBe('warmup'); // default 1000
  });
  it('makes warm-ups worth a fraction of a clove, boosted at higher levels', () => {
    expect(cloveValue({ drill: krrk, level: 1, rating: 1300 })).toBe(0.25);
    expect(cloveValue({ drill: krrk, level: 3, rating: 1300 })).toBe(0.375);
    expect(cloveValue({ drill: krrk, level: 5, rating: 1300 })).toBe(0.5);
    expect(cloveValue({ drill: krk, level: 4, rating: 1100 })).toBe(1);
    expect(cloveValue({ drill: lucena, level: 1, rating: 1300 })).toBe(1);
  });
  it('halves the value when hints or takebacks were used', () => {
    expect(cloveValue({ drill: lucena, level: 1, rating: 1300, hints: 1 })).toBe(0.5);
  });
  it('a lesson replay is worth a full clove, even for a warm-up', () => {
    expect(cloveValue({ drill: krrk, level: 1, rating: 1300, lessonReplay: true })).toBe(1);
  });
  it('starts warm-ups at level 3 and easy drills at level 2', () => {
    expect(startingLevel(krrk, 1300)).toBe(3);
    expect(startingLevel(krk, 1100)).toBe(2);
    expect(startingLevel(lucena, 1300)).toBe(1);
  });
  it('formats fractional cloves', () => {
    expect(formatCloves(0)).toBe('0');
    expect(formatCloves(0.25)).toBe('¼');
    expect(formatCloves(2.75)).toBe('2¾');
    expect(formatCloves(0.375)).toBe('⅜');
    expect(formatCloves(5)).toBe('5');
  });
  it('validates ratings', () => {
    expect(validRating('1300')).toBe(1300);
    expect(validRating(50)).toBe(null);
    expect(validRating('abc')).toBe(null);
  });
});
