import { describe, it, expect } from 'vitest';
import { pathFor, pathChange, stageCost, stageStart, challengeBonus, comboBonus, bulbBonusFor, worldInfo, WORLDS } from '../shared/path.js';

describe('the Garlick Path', () => {
  it('starts at 1-1 and reaches 1-2 at 100 points', () => {
    expect(pathFor(0).label).toBe('1-1');
    expect(pathFor(99).label).toBe('1-1');
    expect(pathFor(100).label).toBe('1-2');
    expect(pathFor(100).toNext).toBe(140);
  });
  it('stages cost a little more each time, capped', () => {
    expect([0, 1, 2, 3, 4].map(stageCost)).toEqual([100, 140, 180, 220, 260]);
    expect(stageCost(100)).toBe(1500);
  });
  it('five stages make a world, and World 2 has its own theme', () => {
    const w2 = stageStart(5); // 100+140+180+220+260
    expect(w2).toBe(900);
    expect(pathFor(w2 - 1).label).toBe('1-5');
    expect(pathFor(w2).label).toBe('2-1');
    expect(pathFor(w2).worldInfo.name).toBe('Pawn Village');
    expect(pathFor(w2 - 1).nextIsNewWorld).toBe(true);
  });
  it('goes on past the seventh world as Legend worlds', () => {
    const end = stageStart(WORLDS.length * 5);
    expect(pathFor(end).label).toBe('8-1');
    expect(pathFor(end).worldInfo.name).toBe('Legend 1');
    expect(worldInfo(9).name).toBe('Legend 2');
  });
  it('reports stage-ups and new worlds between two totals', () => {
    const c = pathChange(850, 1000);
    expect(c.stagesGained).toBe(1);
    expect(c.newWorld).toBe(true);
    expect(pathChange(10, 20).stagesGained).toBe(0);
  });
});

describe('bonus points', () => {
  it('challenge: harder-than-you puzzles pay up to +50% of base', () => {
    expect(challengeBonus(32, 1400, 1200)).toBe(8);
    expect(challengeBonus(32, 1800, 1200)).toBe(16);
    expect(challengeBonus(32, 1000, 1200)).toBe(0);
  });
  it('solve streak: from the third solve in a row, up to +50%', () => {
    expect(comboBonus(20, 2)).toBe(0);
    expect(comboBonus(20, 3)).toBe(2);
    expect(comboBonus(20, 12)).toBe(10);
  });
  it('the full-bulb bonus grows with the daily streak', () => {
    expect(bulbBonusFor(0)).toBe(50);
    expect(bulbBonusFor(4)).toBe(90);
    expect(bulbBonusFor(30)).toBe(150);
  });
});
