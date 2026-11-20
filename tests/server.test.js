import { describe, it, expect } from 'vitest';
import { createNodeStore } from '../server/store-node.js';
import { ensureSchema } from '../server/schema.js';
import { recordAttempt, getTotals, getProgress, getLeaderboard, applyStartingLevels, ensureEndgameRating } from '../server/game.js';
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
  it('lesson replays earn a full clove at most twice a day and never count toward levels', async () => {
    const { store, user } = await setup(1300); // ladder mate is a warm-up at 1300
    const replay = solve({ drillId: 'krrk', level: 3, userMoves: 3, mateIn: 3, lessonReplay: true });
    const a = await recordAttempt(store, user, replay);
    const b = await recordAttempt(store, user, replay);
    const c = await recordAttempt(store, user, replay);
    expect([a.cloveGain, b.cloveGain, c.cloveGain]).toEqual([1, 1, 0]);
    expect(c.lessonCloveCapped).toBe(true);
    expect(c.day.cloves).toBe(2);
    expect(a.progress.qualified).toBe(false);
    expect(a.breakdown.some((x) => x.label.startsWith('Replay after lesson'))).toBe(true);
  });
  it('stores written hints without halving the clove', async () => {
    const { store, user } = await setup(800);
    const r = await recordAttempt(store, user, solve({ writtenHints: 1 }));
    expect(r.cloveGain).toBe(1);
    const row = await store.get('SELECT written_hints FROM attempts WHERE id = (SELECT MAX(id) FROM attempts)');
    expect(row.written_hints).toBe(1);
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

describe('endgame rating and Endgame School', () => {
  const krk = (over = {}) => solve({ drillId: 'krk', level: 2, mateIn: 8, ...over });
  it('starts at your chess rating, rises on solves and falls on failures', async () => {
    const { store, user } = await setup(1200);
    const a = await recordAttempt(store, user, solve({ drillId: 'lucena', userMoves: 6, mateIn: null }));
    expect(a.rating.before).toBe(1200);
    expect(a.rating.delta).toBeGreaterThan(0);
    const b = await recordAttempt(store, user, solve({ drillId: 'lucena', success: false, userMoves: 3, mateIn: null }));
    expect(b.rating.delta).toBeLessThan(0);
    const row = await store.get('SELECT eg_rating, eg_games FROM users WHERE id = ?', user.id);
    expect(Math.round(row.eg_rating)).toBe(b.rating.after);
    expect(row.eg_games).toBe(2);
  });
  it('lesson replays are unrated', async () => {
    const { store, user } = await setup(1200);
    const r = await recordAttempt(store, user, solve({ drillId: 'philidor', lessonReplay: true, mateIn: null }));
    expect(r.rating.rated).toBe(false);
    expect(r.rating.delta).toBe(0);
  });
  it('a drill you are struggling with fills a whole clove even if it is easy for your rating', async () => {
    const { store, user } = await setup(1200);
    // Rook mate (target 800) is "easy" at 1200: half a clove when you have it under control...
    expect((await recordAttempt(store, user, krk())).cloveGain).toBe(0.5);
    // ...but after two failures it's in your School rotation, so a solve is at your level.
    await recordAttempt(store, user, krk({ success: false, userMoves: 20 }));
    await recordAttempt(store, user, krk({ success: false, userMoves: 20 }));
    const r = await recordAttempt(store, user, krk());
    expect(r.school.atLevel).toBe(true);
    expect(r.cloveGain).toBe(1);
    expect(r.cloveNote).toBe(null);
  });
  it('explains a partial clove', async () => {
    const { store, user } = await setup(1200);
    const r = await recordAttempt(store, user, solve({ drillId: 'lucena', takebacks: 1, mateIn: null }));
    expect(r.cloveGain).toBe(0.5);
    expect(r.cloveNote).toMatch(/takeback/);
  });
  it('graduates a drill after five clean solves in a row and schedules a check-up', async () => {
    const { store, user } = await setup(1200);
    let r;
    for (let i = 0; i < 5; i++) r = await recordAttempt(store, user, solve({ drillId: 'kqkp', mateIn: 8, mode: 'school' }));
    expect(r.school.events.graduated).toBe(true);
    expect(r.school.reviewDue).toBe('2026-11-22');
    const p = (await getProgress(store, user.id)).kqkp;
    expect(p.status).toBe('graduated');
    const stored = await store.get('SELECT mode FROM attempts WHERE id = (SELECT MAX(id) FROM attempts)');
    expect(stored.mode).toBe('school');
  });
  it('rebuilds rating and School streaks from older attempts', async () => {
    const { store, user } = await setup(1200);
    for (let i = 0; i < 3; i++) await recordAttempt(store, user, solve({ drillId: 'philidor', mateIn: null }));
    // Forget the derived state, as for a player from before this feature.
    await store.run('UPDATE users SET eg_rating = NULL, eg_games = 0 WHERE id = ?', user.id);
    await store.run('UPDATE progress SET clean_streak = 0 WHERE user_id = ?', user.id);
    const row = await store.get('SELECT * FROM users WHERE id = ?', user.id);
    const u = await ensureEndgameRating(store, row);
    expect(u.eg_games).toBe(3);
    expect(u.eg_rating).toBeGreaterThan(1200);
    expect((await getProgress(store, user.id)).philidor.cleanStreak).toBe(3);
  });
  it('shows endgame ratings on the family board', async () => {
    const { store, user } = await setup(1200);
    await recordAttempt(store, user, solve({ drillId: 'lucena', mateIn: null }));
    const lb = await getLeaderboard(store, '2026-11-19');
    expect(lb.players[0].egRating).toBeGreaterThan(1200);
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
