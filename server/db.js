// SQLite via Node's built-in node:sqlite (no native dependencies to build).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// Loaded via require so test tooling that does not know the prefix-only
// node:sqlite builtin can still import this file.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      avatar        TEXT NOT NULL DEFAULT '🧄',
      color         TEXT NOT NULL DEFAULT '#81b64c',
      settings      TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drill_id     TEXT NOT NULL,
      level        INTEGER NOT NULL,
      fen          TEXT NOT NULL,
      success      INTEGER NOT NULL,
      reason       TEXT,
      duration_ms  INTEGER NOT NULL,
      user_moves   INTEGER NOT NULL,
      waste_plies  INTEGER NOT NULL DEFAULT 0,
      efficiency   REAL NOT NULL,
      grades       TEXT NOT NULL DEFAULT '{}',
      hints        INTEGER NOT NULL DEFAULT 0,
      takebacks    INTEGER NOT NULL DEFAULT 0,
      only_moves   INTEGER NOT NULL DEFAULT 0,
      par_seconds  INTEGER NOT NULL,
      speed_factor REAL NOT NULL,
      perfect      INTEGER NOT NULL,
      points       INTEGER NOT NULL,
      breakdown    TEXT NOT NULL DEFAULT '[]',
      day          TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attempts_user_drill ON attempts(user_id, drill_id);
    CREATE INDEX IF NOT EXISTS attempts_user_day ON attempts(user_id, day);

    CREATE TABLE IF NOT EXISTS progress (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drill_id   TEXT NOT NULL,
      level      INTEGER NOT NULL DEFAULT 1,
      qualifying INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, drill_id)
    );

    CREATE TABLE IF NOT EXISTS days (
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day       TEXT NOT NULL,
      cloves    INTEGER NOT NULL DEFAULT 0,
      bulb_done INTEGER NOT NULL DEFAULT 0,
      bonus     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS achievements (
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL,
      unlocked_at    INTEGER NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    );

    CREATE TABLE IF NOT EXISTS tb_cache (
      fen        TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
