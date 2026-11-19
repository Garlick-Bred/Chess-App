// Garlic Endgames server: accounts, attempts/scoring, leaderboard, a caching
// tablebase proxy, and the built client.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb } from './db.js';
import * as auth from './auth.js';
import { lookup, validFen } from './tablebase.js';
import { recordAttempt, getProgress, getTotals, getDay, getAchievements, getStats, getLeaderboard, httpError } from './game.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT ?? 8787);
const DB_FILE = process.env.DB_FILE ?? path.join(ROOT, 'data', 'garlic.db');
const INVITE_CODE = process.env.INVITE_CODE ?? '';
const SECURE_COOKIES = process.env.COOKIE_SECURE === '1';
const AVATARS = ['🧄', '♞', '♛', '♜', '♝', '♚', '🦉', '🐢', '🦊', '🐼', '🐸', '🦁', '🐙', '🌶️', '🍄', '🌟'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function createApp({ db = openDb(DB_FILE) } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));

  // Attach the logged-in user (if any).
  app.use((req, _res, next) => {
    req.token = auth.parseCookies(req.headers.cookie)[auth.COOKIE];
    req.user = auth.sessionUser(db, req.token);
    next();
  });
  const requireUser = (req, _res, next) => (req.user ? next() : next(httpError(401, 'Please log in')));
  const today = (req) => (DAY_RE.test(req.query.day ?? '') ? req.query.day : new Date().toISOString().slice(0, 10));
  const cookie = (req, token) => auth.sessionCookie(token, { secure: SECURE_COOKIES || req.secure });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) => res.json({ inviteRequired: !!INVITE_CODE, avatars: AVATARS }));

  app.post('/api/auth/register', (req, res, next) => {
    try {
      const { username, password, displayName, inviteCode } = req.body ?? {};
      if (INVITE_CODE && inviteCode !== INVITE_CODE) throw httpError(403, 'That family invite code is not right.');
      if (!auth.USERNAME_RE.test(username ?? '')) throw httpError(400, 'Username: 3-20 letters, numbers, _ or -');
      if (typeof password !== 'string' || password.length < 6) throw httpError(400, 'Password must be at least 6 characters');
      const name = String(displayName || username).trim().slice(0, 24);
      if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw httpError(409, 'That username is taken');
      const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      const r = db
        .prepare('INSERT INTO users (username, display_name, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(username, name, auth.hashPassword(password), avatar, Date.now());
      const token = auth.createSession(db, Number(r.lastInsertRowid));
      res.setHeader('Set-Cookie', cookie(req, token));
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/auth/login', (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      const key = String(username ?? '').toLowerCase();
      if (auth.throttled(key)) throw httpError(429, 'Too many attempts. Try again in a few minutes.');
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? ''));
      if (!user || !auth.verifyPassword(String(password ?? ''), user.password_hash)) {
        auth.recordFailure(key);
        throw httpError(401, 'Wrong username or password');
      }
      auth.clearFailures(key);
      const token = auth.createSession(db, user.id);
      res.setHeader('Set-Cookie', cookie(req, token));
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    auth.destroySession(db, req.token);
    res.setHeader('Set-Cookie', auth.clearCookie());
    res.json({ ok: true });
  });

  app.get('/api/me', requireUser, (req, res) => {
    const day = today(req);
    res.json({
      user: publicUser(req.user),
      totals: getTotals(db, req.user.id, day),
      today: getDay(db, req.user.id, day),
      progress: getProgress(db, req.user.id),
    });
  });

  app.put('/api/me', requireUser, (req, res, next) => {
    try {
      const b = req.body ?? {};
      const settings = { ...JSON.parse(req.user.settings || '{}') };
      if (['white', 'black', 'random'].includes(b.playAs)) settings.playAs = b.playAs;
      if (typeof b.sound === 'boolean') settings.sound = b.sound;
      if (typeof b.coordinates === 'boolean') settings.coordinates = b.coordinates;
      if (typeof b.autoQueen === 'boolean') settings.autoQueen = b.autoQueen;
      if (typeof b.chesscom === 'string') settings.chesscom = b.chesscom.trim().slice(0, 40);
      const name = typeof b.displayName === 'string' && b.displayName.trim() ? b.displayName.trim().slice(0, 24) : req.user.display_name;
      const avatar = AVATARS.includes(b.avatar) ? b.avatar : req.user.avatar;
      const color = /^#[0-9a-fA-F]{6}$/.test(b.color ?? '') ? b.color : req.user.color;
      db.prepare('UPDATE users SET display_name = ?, avatar = ?, color = ?, settings = ? WHERE id = ?').run(
        name,
        avatar,
        color,
        JSON.stringify(settings),
        req.user.id,
      );
      if (typeof b.newPassword === 'string' && b.newPassword) {
        if (b.newPassword.length < 6) throw httpError(400, 'Password must be at least 6 characters');
        if (!auth.verifyPassword(String(b.currentPassword ?? ''), req.user.password_hash)) throw httpError(403, 'Current password is wrong');
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(b.newPassword), req.user.id);
      }
      res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/attempts', requireUser, (req, res, next) => {
    try {
      res.json(recordAttempt(db, req.user, req.body ?? {}));
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/stats', requireUser, (req, res) => res.json(getStats(db, req.user.id, today(req))));
  app.get('/api/achievements', requireUser, (req, res) => res.json(getAchievements(db, req.user.id)));
  app.get('/api/leaderboard', requireUser, (req, res) => res.json(getLeaderboard(db, today(req))));

  app.get('/api/tablebase', async (req, res, next) => {
    try {
      const fen = String(req.query.fen ?? '');
      if (!validFen(fen)) throw httpError(400, 'Bad FEN (max 7 pieces)');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.json(await lookup(db, fen));
    } catch (e) {
      next(e.status ? e : httpError(502, `Tablebase unavailable: ${e.message}`));
    }
  });

  // Built client (npm run build) - single-page app.
  const dist = path.join(ROOT, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    const status = err.status ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message ?? 'Server error' });
  });
  return app;
}

function publicUser(u) {
  const settings = JSON.parse(u.settings || '{}');
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: u.avatar,
    color: u.color,
    settings: { playAs: 'random', sound: true, coordinates: true, autoQueen: false, ...settings },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  app.listen(PORT, () => console.log(`Garlic Endgames listening on http://localhost:${PORT}`));
}
