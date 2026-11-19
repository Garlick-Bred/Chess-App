import { describe, it, expect } from 'vitest';
import { createNodeStore } from '../server/store-node.js';
import { ensureSchema } from '../server/schema.js';
import { recordAttempt, getTotals, getProgress, getLeaderboard, applyStartingLevels } from '../server/game.js';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { validFen } from '../server/tablebase.js';
import { createApi } from '../server/api.js';

async function setup(rating = null) {
  const store = createNodeStore(':memory:');
  await ensureSchema(store);
  const r = await store.run(
    'INSERT INTO users (username, display_name, password_hash, rating, created_at) VALUES (?,?,?,?,?)',
    'kid',
    'Kid',
    'x',
    rating,
    0,
  );
  await applyStartingLevels(store, r.lastId, rating);
  return { store, user: { id: r.lastId, rating } };
}

const solve = (over = {}) => ({ drillId: 'krk', level: 1, success: true, durationMs: 20000, userMoves: 8, wastePlies: 0, mateIn: 8, day: '2026-11-19', ...over });

describe('attempts', () => {
  it('levels up after three qualifying solves', async () => {
    const { store, user } = await setup(800);
    await recordAttempt(store, user, solve());
    await recordAttempt(store, user, solve());
    const r = await recordAttempt(store, user, solve());
    expect(r.progress.levelUp).toBe(true);
    expect((await getProgress(store, user.id)).krk.level).toBe(2);
  });
  it('does not count sloppy or assisted solves toward the next level', async () => {
    const { store, user } = await setup(800);
    expect((await recordAttempt(store, user, solve({ userMoves: 10, wastePlies: 10 }))).progress.qualified).toBe(false);
    expect((await recordAttempt(store, user, solve({ takebacks: 1 }))).progress.qualified).toBe(false);
  });
  it('fills cloves by drill value and awards the bulb bonus once', async () => {
    const { store, user } = await setup(800); // rook mate is core learning at 800
    let last;
    for (let i = 0; i < 6; i++) last = await recordAttempt(store, user, solve());
    expect(last.cloveGain).toBe(1);
    expect(last.day.cloves).toBe(6);
    const t = await getTotals(store, user.id, '2026-11-19');
    expect(t.bulbs).toBe(1);
    expect(t.streak).toBe(1);
  });
  it('warm-up drills only fill part of a clove for stronger players', async () => {
    const { store, user } = await setup(1300);
    // Ladder mate is a warm-up at 1300 and starts at level 3: 1/4 x 1.5
    expect((await getProgress(store, user.id)).krrk.level).toBe(3);
    const r = await recordAttempt(store, user, solve({ drillId: 'krrk', level: 3, userMoves: 3, mateIn: 3 }));
    expect(r.cloveGain).toBeCloseTo(0.375);
    expect(r.day.cloves).toBeCloseTo(0.375);
    expect(r.day.bulbDone).toBe(false);
  });
  it('failures give no clove and no points', async () => {
    const { store, user } = await setup();
    const r = await recordAttempt(store, user, solve({ success: false }));
    expect(r.points).toBe(0);
    expect(r.cloveGain).toBe(0);
    expect(r.day.cloves).toBe(0);
  });
  it('accepts a hold drill that secured the draw early, rejects a zero-move solve, clamps level', async () => {
    const { store, user } = await setup(800);
    const early = await recordAttempt(store, user, solve({ drillId: 'kpk-draw', userMoves: 3, reason: 'Draw secured' }));
    expect(early.points).toBeGreaterThan(0);
    expect(early.day.cloves).toBeGreaterThan(0);
    await expect(recordAttempt(store, user, solve({ userMoves: 0 }))).rejects.toThrow();
    expect((await recordAttempt(store, user, solve({ level: 5 }))).progress.level).toBe(1);
  });
  it('unlocks achievements', async () => {
    const { store, user } = await setup();
    const r = await recordAttempt(store, user, solve());
    expect(r.newAchievements.map((a) => a.id)).toContain('first-solve');
  });
  it('builds a leaderboard with ratings and family records', async () => {
    const { store, user } = await setup(800);
    await recordAttempt(store, user, solve());
    const lb = await getLeaderboard(store, '2026-11-19');
    expect(lb.players[0].weekPoints).toBeGreaterThan(0);
    expect(lb.players[0].rating).toBe(800);
    expect(lb.records.krk.secondsPerMove).toBeCloseTo(2.5);
  });
});

describe('auth + validation', () => {
  it('verifies PBKDF2 hashes', async () => {
    const h = await hashPassword('garlick!');
    expect(h.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('garlick!', h)).toBe(true);
    expect(await verifyPassword('onion', h)).toBe(false);
  });
  it('only proxies small, well-formed positions to the tablebase', () => {
    expect(validFen('8/8/8/4k3/8/8/8/4K2R w - - 0 1')).toBe(true);
    expect(validFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false);
    expect(validFen('hello')).toBe(false);
  });
});

describe('HTTP API (fetch handler)', () => {
  const base = 'https://example.test';
  const call = (handle, path, { method = 'GET', body, cookie } = {}) =>
    handle(
      new Request(base + path, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      }),
    );

  it('requires the invite code, registers with a rating, and places drills by rating', async () => {
    const handle = createApi({ store: createNodeStore(':memory:'), env: { INVITE_CODE: 'clove-123' } });
    const bad = await call(handle, '/api/auth/register', { method: 'POST', body: { username: 'mitch', password: 'longenough', inviteCode: 'nope' } });
    expect(bad.status).toBe(403);
    const ok = await call(handle, '/api/auth/register', {
      method: 'POST',
      body: { username: 'mitch', password: 'longenough', displayName: 'Mitch', inviteCode: 'clove-123', rating: 1300, ratingSource: 'chesscom-rapid' },
    });
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get('set-cookie');
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    const me = await (await call(handle, '/api/me', { cookie: cookie.split(';')[0] })).json();
    expect(me.user.rating).toBe(1300);
    expect(me.user.ratingSource).toBe('chesscom-rapid');
    expect(me.progress.krrk.level).toBe(3); // warm-up
    expect(me.progress.lucena.level).toBe(1); // core
  });

  it('rejects short passwords, wrong logins, and unauthenticated calls', async () => {
    const handle = createApi({ store: createNodeStore(':memory:') });
    expect((await call(handle, '/api/auth/register', { method: 'POST', body: { username: 'abc', password: 'short' } })).status).toBe(400);
    await call(handle, '/api/auth/register', { method: 'POST', body: { username: 'abc', password: 'longenough' } });
    expect((await call(handle, '/api/auth/login', { method: 'POST', body: { username: 'abc', password: 'wrongpass' } })).status).toBe(401);
    expect((await call(handle, '/api/auth/login', { method: 'POST', body: { username: 'abc', password: 'longenough' } })).status).toBe(200);
    expect((await call(handle, '/api/me')).status).toBe(401);
    expect(await handle(new Request(base + '/not-api'))).toBe(null);
  });

  it('updating the rating re-places untouched drills', async () => {
    const handle = createApi({ store: createNodeStore(':memory:') });
    const reg = await call(handle, '/api/auth/register', { method: 'POST', body: { username: 'gran', password: 'longenough', rating: 800 } });
    const cookie = reg.headers.get('set-cookie').split(';')[0];
    let me = await (await call(handle, '/api/me', { cookie })).json();
    expect(me.progress.krk.level).toBe(1);
    await call(handle, '/api/me', { method: 'PUT', cookie, body: { rating: 1600, ratingSource: 'fide' } });
    me = await (await call(handle, '/api/me', { cookie })).json();
    expect(me.progress.krk.level).toBe(3);
    expect(me.user.ratingSource).toBe('fide');
  });
});
