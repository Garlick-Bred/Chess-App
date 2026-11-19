// Username/password accounts with scrypt hashing and cookie sessions.
import crypto from 'node:crypto';

const SESSION_DAYS = 60;
export const COOKIE = 'ge_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now,
    now + SESSION_DAYS * 86400e3,
  );
  return token;
}

export function sessionUser(db, token) {
  if (!token) return null;
  const row = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?')
    .get(token, Date.now());
  return row ?? null;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure }) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Simple in-memory brute-force throttle: 8 failures -> 5 minute lockout.
const failures = new Map();
export function throttled(key) {
  const f = failures.get(key);
  return f && f.until > Date.now();
}
export function recordFailure(key) {
  const f = failures.get(key) ?? { count: 0, until: 0 };
  f.count++;
  if (f.count >= 8) {
    f.until = Date.now() + 5 * 60e3;
    f.count = 0;
  }
  failures.set(key, f);
}
export function clearFailures(key) {
  failures.delete(key);
}

export const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;
