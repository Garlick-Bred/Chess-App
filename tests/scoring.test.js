import { describe, it, expect } from 'vitest';
import { scoreAttempt, qualifiesForLevel, bulbStreak, rankFor, masteryStars, addDays } from '../shared/scoring.js';
import { getDrill, parSeconds, moveCap } from '../shared/drills.js';

const kqk = getDrill('kqk');

describe('scoreAttempt', () => {
  const base = { drill: kqk, level: 1, success: true, durationMs: 10000, userMoves: 5, wastePlies: 0, parSeconds: 25 };
  it('gives full bonuses for a fast perfect solve', () => {
    const s = scoreAttempt({ ...base, durationMs: 10000 });
    expect(s.perfect).toBe(true);
    // base 10 + efficiency 5 + speed 5 (<= half par) + perfect 3
    expect(s.total).toBe(23);
  });
  it('scales efficiency bonus and drops perfect for wasted moves', () => {
    const s = scoreAttempt({ ...base, userMoves: 8, wastePlies: 6 });
    expect(s.efficiency).toBeCloseTo(5 / 8);
    expect(s.perfect).toBe(false);
  });
  it('gives zero for a failure', () => {
    expect(scoreAttempt({ ...base, success: false }).total).toBe(0);
  });
  it('penalises hints and takebacks but never below 20% of base', () => {
    const s = scoreAttempt({ ...base, hints: 10, takebacks: 3, durationMs: 60000 });
    expect(s.total).toBe(2);
  });
  it('higher levels are worth more', () => {
    expect(scoreAttempt({ ...base, level: 5 }).base).toBe(20);
  });
  it('rewards only-moves when defending', () => {
    const hold = getDrill('kpk-draw');
    const s = scoreAttempt({ drill: hold, level: 1, success: true, durationMs: 20000, userMoves: 8, onlyMoves: 3, parSeconds: 50 });
    expect(s.breakdown.some((b) => b.label.startsWith('Only moves'))).toBe(true);
  });
});

describe('levels and ranks', () => {
  it('needs efficiency and (at speed levels) par to qualify', () => {
    const a = { success: true, takebacks: 0, efficiency: 0.8, durationMs: 20000, parSeconds: 15 };
    expect(qualifiesForLevel(a, 2)).toBe(true);
    expect(qualifiesForLevel(a, 4)).toBe(false);
    expect(qualifiesForLevel({ ...a, efficiency: 0.5 }, 2)).toBe(false);
    expect(qualifiesForLevel({ ...a, takebacks: 1 }, 2)).toBe(false);
  });
  it('mastery stars follow level', () => {
    expect(masteryStars({ solves: 0 })).toBe(0);
    expect(masteryStars({ solves: 1, level: 1 })).toBe(1);
    expect(masteryStars({ solves: 9, level: 3 })).toBe(3);
    expect(masteryStars({ solves: 20, level: 5, qualifying: 3 })).toBe(5);
  });
  it('ranks by points', () => {
    expect(rankFor(0).name).toBe('Sprout');
    expect(rankFor(800).name).toBe('Clove');
    expect(rankFor(25000).next).toBe(null);
  });
});

describe('bulb streak', () => {
  it('counts consecutive full-bulb days ending today or yesterday', () => {
    expect(bulbStreak(['2026-11-17', '2026-11-18', '2026-11-19'], '2026-11-19')).toBe(3);
    expect(bulbStreak(['2026-11-17', '2026-11-18'], '2026-11-19')).toBe(2);
    expect(bulbStreak(['2026-11-15', '2026-11-18'], '2026-11-19')).toBe(1);
    expect(bulbStreak([], '2026-11-19')).toBe(0);
  });
  it('handles month boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('par and caps', () => {
  it('scales par with position length and level', () => {
    expect(parSeconds(kqk, { mateIn: 5 }, 1)).toBeGreaterThan(parSeconds(kqk, { mateIn: 5 }, 5));
    expect(parSeconds(kqk, { mateIn: 9 }, 1)).toBeGreaterThan(parSeconds(kqk, { mateIn: 3 }, 1));
  });
  it('never allows more than 50 moves', () => {
    expect(moveCap(getDrill('kbnk'), { mateIn: 33 })).toBe(50);
    expect(moveCap(kqk, { mateIn: 6 })).toBe(14);
  });
});
