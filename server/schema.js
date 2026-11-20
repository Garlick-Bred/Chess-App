// Database schema, shared by local SQLite (node:sqlite) and Cloudflare D1.
// Kept as separate statements because D1 runs them as a batch.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar        TEXT NOT NULL DEFAULT '♞',
    color         TEXT NOT NULL DEFAULT '#81b64c',
    settings      TEXT NOT NULL DEFAULT '{}',
    rating        INTEGER,
    rating_source TEXT,
    eg_rating     REAL,
    eg_games      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attempts (
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
    clove_gain   REAL NOT NULL DEFAULT 0,
    written_hints INTEGER NOT NULL DEFAULT 0,
    lesson_replay INTEGER NOT NULL DEFAULT 0,
    mode         TEXT,
    puzzle_rating INTEGER,
    eg_before    REAL,
    eg_after     REAL,
    breakdown    TEXT NOT NULL DEFAULT '[]',
    day          TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS attempts_user_drill ON attempts(user_id, drill_id)`,
  `CREATE INDEX IF NOT EXISTS attempts_user_day ON attempts(user_id, day)`,
  `CREATE TABLE IF NOT EXISTS progress (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    drill_id   TEXT NOT NULL,
    level      INTEGER NOT NULL DEFAULT 1,
    qualifying INTEGER NOT NULL DEFAULT 0,
    clean_streak INTEGER NOT NULL DEFAULT 0,
    status     TEXT,
    review_due TEXT,
    review_step INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, drill_id)
  )`,
  `CREATE TABLE IF NOT EXISTS days (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day       TEXT NOT NULL,
    cloves    REAL NOT NULL DEFAULT 0,
    bulb_done INTEGER NOT NULL DEFAULT 0,
    bonus     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
  )`,
  `CREATE TABLE IF NOT EXISTS achievements (
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id TEXT NOT NULL,
    unlocked_at    INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tb_cache (
    fen        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_failures (
    key   TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    until INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

/** Bump when SCHEMA or ADDED_COLUMNS change, so existing databases migrate. */
export const SCHEMA_VERSION = 5;

// Columns added after the first release; added to older databases on start.
export const ADDED_COLUMNS = [
  ['users', 'rating', 'INTEGER'],
  ['users', 'rating_source', 'TEXT'],
  ['attempts', 'clove_gain', 'REAL NOT NULL DEFAULT 0'],
  ['attempts', 'written_hints', 'INTEGER NOT NULL DEFAULT 0'],
  ['attempts', 'lesson_replay', 'INTEGER NOT NULL DEFAULT 0'],
  // v4: endgame rating and Endgame School
  ['users', 'eg_rating', 'REAL'],
  ['users', 'eg_games', 'INTEGER NOT NULL DEFAULT 0'],
  ['attempts', 'mode', 'TEXT'],
  ['attempts', 'puzzle_rating', 'INTEGER'],
  ['attempts', 'eg_before', 'REAL'],
  ['attempts', 'eg_after', 'REAL'],
  ['progress', 'clean_streak', 'INTEGER NOT NULL DEFAULT 0'],
  ['progress', 'status', 'TEXT'],
  ['progress', 'review_due', 'TEXT'],
  ['progress', 'review_step', 'INTEGER NOT NULL DEFAULT 0'],
];

/**
 * One-off data changes, run once when a database moves past that version.
 * v5: the School and rating rules changed (10 solves to graduate, solves never
 * lower the rating), so every player's rating and streaks are rebuilt from
 * their history on their next visit.
 */
export const DATA_MIGRATIONS = {
  5: ['UPDATE users SET eg_rating = NULL, eg_games = 0'],
};

/**
 * Create tables and add any missing columns. Costs a single query when the
 * database is already up to date (it runs on every cold start of a Worker).
 */
export async function ensureSchema(store) {
  let from = 0;
  try {
    const row = await store.get("SELECT value FROM meta WHERE key = 'schema_version'");
    from = Number(row?.value ?? 0);
    if (from >= SCHEMA_VERSION) return;
  } catch {
    // meta table missing: older or empty database
  }
  await store.batch(SCHEMA.map((sql) => [sql, []]));
  for (const [table, column, type] of ADDED_COLUMNS) {
    const cols = await store.all(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) await store.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  for (const [version, statements] of Object.entries(DATA_MIGRATIONS)) {
    if (Number(version) > from) for (const sql of statements) await store.run(sql);
  }
  await store.run(
    "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    String(SCHEMA_VERSION),
  );
}
