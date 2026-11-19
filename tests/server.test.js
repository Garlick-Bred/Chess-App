import { describe, it, expect } from 'vitest';
import { openDb } from '../server/db.js';
import { recordAttempt, getTotals, getProgress, getLeaderboard } from '../server/game.js';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { validFen } from '../server/tablebase.js';

function setup() {
  const db = openDb(':memory:');
  const id = Number(
    db.prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?,?,?,?)').run('kid', 'Kid', hashPassword('secret1'), 0)
      .lastInsertRowid,
  );
  return { db, user: { id } };
}

const solve = (over = {}) => ({ drillId: 'krk', level: 1, success: true, durationMs: 20000, userMoves: 8, wastePlies: 0, mateIn: 8, day: '2026-11-19', ...over });

describe('attempts', () => {
  it('levels up after three qualifying solves', () => {
    const { db, user } = setup();
    recordAttempt(db, user, solve());
    recordAttempt(db, user, solve());
    const r = recordAttempt(db, user, solve());
    expect(r.progress.levelUp).toBe(true);
    expect(getProgress(db, user.id).krk.level).toBe(2);
  });
  it('does not count sloppy or assisted solves toward the next level', () => {
    const { db, user } = setup();
    const r = recordAttempt(db, user, solve({ userMoves: 10, wastePlies: 10 }));
    expect(r.progress.qualified).toBe(false);
    expect(recordAttempt(db, user, solve({ takebacks: 1 })).progress.qualified).toBe(false);
  });
  it('fills a clove per solve and awards the bulb bonus once', () => {
    const { db, user } = setup();
    let last;
    for (let i = 0; i < 6; i++) last = recordAttempt(db, user, solve());
    expect(last.day.cloves).toBe(6);
    const t = getTotals(db, user.id, '2026-11-19');
    expect(t.bulbs).toBe(1);
    expect(t.streak).toBe(1);
  });
  it('failures give no clove and no points', () => {
    const { db, user } = setup();
    const r = recordAttempt(db, user, solve({ success: false }));
    expect(r.points).toBe(0);
    expect(r.day.cloves).toBe(0);
  });
  it('accepts a hold drill that secured the draw early, rejects a zero-move solve, clamps level', () => {
    const { db, user } = setup();
    const early = recordAttempt(db, user, solve({ drillId: 'kpk-draw', userMoves: 3, reason: 'Draw secured' }));
    expect(early.points).toBeGreaterThan(0);
    expect(early.day.cloves).toBe(1);
    expect(() => recordAttempt(db, user, solve({ userMoves: 0 }))).toThrow();
    expect(recordAttempt(db, user, solve({ level: 5 })).progress.level).toBe(1);
  });
  it('unlocks achievements', () => {
    const { db, user } = setup();
    const r = recordAttempt(db, user, solve());
    expect(r.newAchievements.map((a) => a.id)).toContain('first-solve');
  });
  it('builds a leaderboard with family records', () => {
    const { db, user } = setup();
    recordAttempt(db, user, solve());
    const lb = getLeaderboard(db, '2026-11-19');
    expect(lb.players[0].weekPoints).toBeGreaterThan(0);
    expect(lb.records.krk.secondsPerMove).toBeCloseTo(2.5);
  });
});

describe('auth + validation', () => {
  it('verifies scrypt hashes', () => {
    const h = hashPassword('garlick!');
    expect(verifyPassword('garlick!', h)).toBe(true);
    expect(verifyPassword('onion', h)).toBe(false);
  });
  it('only proxies small, well-formed positions to the tablebase', () => {
    expect(validFen('8/8/8/4k3/8/8/8/4K2R w - - 0 1')).toBe(true);
    expect(validFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false);
    expect(validFen('hello')).toBe(false);
  });
});
