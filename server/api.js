// The JSON API as a standard fetch handler: (Request) -> Response, or null for
// non-API paths. Runs unchanged in Cloudflare Workers (with D1) and in the
// local Node server (with node:sqlite).
import * as auth from './auth.js';
import { ensureSchema } from './schema.js';
import { lookup, validFen } from './tablebase.js';
import {
  recordAttempt,
  getProgress,
  getTotals,
  getDay,
  getAchievements,
  getStats,
  getLeaderboard,
  applyStartingLevels,
  httpError,
} from './game.js';
import { RATING_SOURCES, validRating } from '../shared/cloves.js';

export const AVATARS = ['♞', '♛', '♜', '♝', '♚', '🦉', '🐢', '🦊', '🐼', '🐸', '🦁', '🐙', '🌶️', '🍄', '🌟', '☕'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BODY = 64 * 1024;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function publicUser(u) {
  const settings = JSON.parse(u.settings || '{}');
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    color: u.color,
    rating: u.rating ?? null,
    ratingSource: u.rating_source ?? null,
    settings: { playAs: 'random', sound: true, coordinates: true, autoQueen: false, ...settings },
  };
}

/**
 * @param {{ store: object, env?: Record<string,string> }} opts
 *   env.INVITE_CODE    - if set, sign-up requires it
 *   env.COOKIE_SECURE  - "1" forces Secure cookies (otherwise https requests get them)
 *   env.TABLEBASE_URL  - alternative tablebase endpoint
 */
export function createApi({ store, env = {} }) {
  const inviteCode = env.INVITE_CODE ?? '';
  let ready = null;

  async function body(request) {
    const len = Number(request.headers.get('content-length') ?? 0);
    if (len > MAX_BODY) throw httpError(413, 'Request too large');
    const text = await request.text();
    if (text.length > MAX_BODY) throw httpError(413, 'Request too large');
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      throw httpError(400, 'Bad JSON');
    }
  }

  return async function handle(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return null;
    ready ??= ensureSchema(store).catch((e) => {
      ready = null;
      throw e;
    });
    try {
      await ready;
      return await route(request, url);
    } catch (e) {
      const status = e.status ?? 500;
      if (status >= 500) console.error(e);
      return json({ error: status >= 500 ? `Server error: ${e.message}` : e.message }, status);
    }
  };

  async function route(request, url) {
    const method = request.method;
    const path = url.pathname;
    const secure = env.COOKIE_SECURE === '1' || url.protocol === 'https:';
    const token = auth.parseCookies(request.headers.get('cookie'))[auth.COOKIE];
    const day = DAY_RE.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day') : new Date().toISOString().slice(0, 10);
    const needUser = async () => {
      const u = await auth.sessionUser(store, token);
      if (!u) throw httpError(401, 'Please log in');
      return u;
    };

    if (method === 'GET' && path === '/api/health') return json({ ok: true });
    if (method === 'GET' && path === '/api/config') {
      return json({ inviteRequired: !!inviteCode, avatars: AVATARS, ratingSources: RATING_SOURCES });
    }

    if (method === 'POST' && path === '/api/auth/register') {
      const b = await body(request);
      if (inviteCode && String(b.inviteCode ?? '').trim() !== inviteCode) throw httpError(403, 'That family invite code is not right.');
      if (!auth.USERNAME_RE.test(b.username ?? '')) throw httpError(400, 'Username: 3-20 letters, numbers, _ or -');
      if (typeof b.password !== 'string' || b.password.length < 8) throw httpError(400, 'Password must be at least 8 characters');
      const name = String(b.displayName || b.username).trim().slice(0, 24);
      if (await store.get('SELECT 1 x FROM users WHERE username = ?', b.username)) throw httpError(409, 'That username is taken');
      const rating = b.rating == null || b.rating === '' ? null : validRating(b.rating);
      if (b.rating != null && b.rating !== '' && rating == null) throw httpError(400, 'Rating should be a number between 100 and 3000');
      const source = RATING_SOURCES[b.ratingSource] ? b.ratingSource : rating ? 'guess' : null;
      const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      const r = await store.run(
        'INSERT INTO users (username, display_name, password_hash, avatar, rating, rating_source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        b.username,
        name,
        await auth.hashPassword(b.password),
        avatar,
        rating,
        source,
        Date.now(),
      );
      const userId = r.lastId ?? (await store.get('SELECT id FROM users WHERE username = ?', b.username)).id;
      await applyStartingLevels(store, userId, rating);
      const t = await auth.createSession(store, userId);
      return json({ ok: true }, 200, { 'Set-Cookie': auth.sessionCookie(t, { secure }) });
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const b = await body(request);
      const key = String(b.username ?? '').toLowerCase();
      if (await auth.throttled(store, key)) throw httpError(429, 'Too many attempts. Try again in a few minutes.');
      const user = await store.get('SELECT * FROM users WHERE username = ?', String(b.username ?? ''));
      if (!user || !(await auth.verifyPassword(String(b.password ?? ''), user.password_hash))) {
        await auth.recordFailure(store, key);
        throw httpError(401, 'Wrong username or password');
      }
      await auth.clearFailures(store, key);
      const t = await auth.createSession(store, user.id);
      return json({ ok: true }, 200, { 'Set-Cookie': auth.sessionCookie(t, { secure }) });
    }

    if (method === 'POST' && path === '/api/auth/logout') {
      await auth.destroySession(store, token);
      return json({ ok: true }, 200, { 'Set-Cookie': auth.clearCookie({ secure }) });
    }

    if (method === 'GET' && path === '/api/me') {
      const u = await needUser();
      return json({
        user: publicUser(u),
        totals: await getTotals(store, u.id, day),
        today: await getDay(store, u.id, day),
        progress: await getProgress(store, u.id),
      });
    }

    if (method === 'PUT' && path === '/api/me') {
      const u = await needUser();
      const b = await body(request);
      const settings = { ...JSON.parse(u.settings || '{}') };
      if (['white', 'black', 'random'].includes(b.playAs)) settings.playAs = b.playAs;
      if (typeof b.sound === 'boolean') settings.sound = b.sound;
      if (typeof b.coordinates === 'boolean') settings.coordinates = b.coordinates;
      if (typeof b.autoQueen === 'boolean') settings.autoQueen = b.autoQueen;
      if (typeof b.chesscom === 'string') settings.chesscom = b.chesscom.trim().slice(0, 40);
      const name = typeof b.displayName === 'string' && b.displayName.trim() ? b.displayName.trim().slice(0, 24) : u.display_name;
      const avatar = AVATARS.includes(b.avatar) ? b.avatar : u.avatar;
      const color = /^#[0-9a-fA-F]{6}$/.test(b.color ?? '') ? b.color : u.color;
      let rating = u.rating;
      let source = u.rating_source;
      if ('rating' in b) {
        rating = b.rating == null || b.rating === '' ? null : validRating(b.rating);
        if (b.rating != null && b.rating !== '' && rating == null) throw httpError(400, 'Rating should be a number between 100 and 3000');
      }
      if (RATING_SOURCES[b.ratingSource]) source = b.ratingSource;
      if (typeof b.newPassword === 'string' && b.newPassword) {
        if (b.newPassword.length < 8) throw httpError(400, 'Password must be at least 8 characters');
        if (!(await auth.verifyPassword(String(b.currentPassword ?? ''), u.password_hash))) throw httpError(403, 'Current password is wrong');
        await store.run('UPDATE users SET password_hash = ? WHERE id = ?', await auth.hashPassword(b.newPassword), u.id);
      }
      await store.run(
        'UPDATE users SET display_name = ?, avatar = ?, color = ?, settings = ?, rating = ?, rating_source = ? WHERE id = ?',
        name,
        avatar,
        color,
        JSON.stringify(settings),
        rating,
        source,
        u.id,
      );
      if (rating !== u.rating) await applyStartingLevels(store, u.id, rating);
      return json({ user: publicUser(await store.get('SELECT * FROM users WHERE id = ?', u.id)) });
    }

    if (method === 'POST' && path === '/api/attempts') {
      const u = await needUser();
      return json(await recordAttempt(store, u, await body(request)));
    }
    if (method === 'GET' && path === '/api/stats') return json(await getStats(store, (await needUser()).id, day));
    if (method === 'GET' && path === '/api/achievements') return json(await getAchievements(store, (await needUser()).id));
    if (method === 'GET' && path === '/api/leaderboard') {
      await needUser();
      return json(await getLeaderboard(store, day));
    }

    if (method === 'GET' && path === '/api/tablebase') {
      const fen = url.searchParams.get('fen') ?? '';
      if (!validFen(fen)) throw httpError(400, 'Bad FEN (max 7 pieces)');
      try {
        return json(await lookup(store, fen, env.TABLEBASE_URL), 200, { 'Cache-Control': 'private, max-age=86400' });
      } catch (e) {
        throw httpError(502, `Tablebase unavailable: ${e.message}`);
      }
    }

    throw httpError(404, 'Not found');
  }
}
