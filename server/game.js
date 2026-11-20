// Server-side game logic: record attempts, recompute points with the shared
// scoring rules, level up drills, fill Garlick cloves and unlock achievements.
// Works against any store with the async get/all/run/batch interface
// (local SQLite or Cloudflare D1).
import { DRILLS, DRILL_BY_ID, MAX_LEVEL, parSeconds } from '../shared/drills.js';
import { scoreAttempt, qualifiesForLevel, SOLVES_TO_LEVEL, BULB_CLOVES, BULB_BONUS, PB_BONUS_SHARE, bulbStreak, rankFor, masteryStars, addDays } from '../shared/scoring.js';
import { cloveValue, cloveShortfall, startingLevel, LESSON_CLOVES_PER_DAY } from '../shared/cloves.js';
import { puzzleRating, solveScore, rateAttempt, startingEndgameRating } from '../shared/rating.js';
import { buildCurriculum, atYourLevel, advanceSchool, countsForSchool, GRADUATE_AFTER } from '../shared/curriculum.js';
import { ACHIEVEMENTS, newlyUnlocked } from '../shared/achievements.js';
import { GRADES } from '../shared/grading.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 1e-9;
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

export async function getProgress(store, userId) {
  const rows = await store.all(
    'SELECT drill_id, level, qualifying, clean_streak, status, review_due, review_step FROM progress WHERE user_id = ?',
    userId,
  );
  const solves = await store.all(
    `SELECT drill_id, MIN(CASE WHEN success THEN duration_ms * 1.0 / MAX(user_moves, 1) END) best_spm,
            MIN(CASE WHEN success THEN duration_ms END) best_ms, COUNT(*) attempts, SUM(success) solves
     FROM attempts WHERE user_id = ? GROUP BY drill_id`,
    userId,
  );
  const byId = Object.fromEntries(rows.map((r) => [r.drill_id, r]));
  const sById = Object.fromEntries(solves.map((r) => [r.drill_id, r]));
  const out = {};
  for (const d of DRILLS) {
    const p = byId[d.id] ?? { level: 1, qualifying: 0 };
    const s = sById[d.id] ?? {};
    const rec = {
      level: p.level,
      qualifying: p.qualifying,
      cleanStreak: p.clean_streak ?? 0,
      status: p.status ?? 'learning',
      reviewDue: p.review_due ?? null,
      reviewStep: p.review_step ?? 0,
      solves: s.solves ?? 0,
      attempts: s.attempts ?? 0,
      bestSecondsPerMove: s.best_spm != null ? s.best_spm / 1000 : null,
      bestMs: s.best_ms ?? null,
    };
    rec.stars = masteryStars(rec);
    out[d.id] = rec;
  }
  return out;
}

/**
 * Place a player on each drill according to their rating: warm-up drills
 * start at level 3, easy ones at level 2. Only raises the level of drills
 * the player has not attempted yet.
 */
export async function applyStartingLevels(store, userId, rating) {
  const progress = await getProgress(store, userId);
  const writes = [];
  for (const d of DRILLS) {
    const p = progress[d.id];
    const start = startingLevel(d, rating);
    if (p.attempts === 0 && p.level !== start) {
      writes.push([
        `INSERT INTO progress (user_id, drill_id, level, qualifying) VALUES (?, ?, ?, 0)
         ON CONFLICT(user_id, drill_id) DO UPDATE SET level = excluded.level, qualifying = 0`,
        [userId, d.id, start],
      ]);
    }
  }
  await store.batch(writes);
}

export async function getTotals(store, userId, today) {
  const a = await store.get(
    `SELECT COALESCE(SUM(points),0) pts, COALESCE(SUM(success),0) solves, COALESCE(SUM(perfect),0) perfects,
            COALESCE(SUM(CASE WHEN success AND speed_factor >= 0.999 THEN 1 ELSE 0 END),0) speed_max
     FROM attempts WHERE user_id = ?`,
    userId,
  );
  const b = await store.get('SELECT COALESCE(SUM(bonus),0) bonus, COALESCE(SUM(bulb_done),0) bulbs FROM days WHERE user_id = ?', userId);
  const doneDays = (await store.all('SELECT day FROM days WHERE user_id = ? AND bulb_done = 1', userId)).map((r) => r.day);
  const progress = await getProgress(store, userId);
  const solvesByDrill = {};
  const levelByDrill = {};
  for (const [id, p] of Object.entries(progress)) {
    if (p.solves) solvesByDrill[id] = p.solves;
    levelByDrill[id] = p.level;
  }
  const points = a.pts + b.bonus;
  return {
    points,
    solves: a.solves,
    perfects: a.perfects,
    speedMax: a.speed_max,
    bulbs: b.bulbs,
    streak: today ? bulbStreak(doneDays, today) : 0,
    solvesByDrill,
    levelByDrill,
    drillCount: DRILLS.length,
    rank: rankFor(points),
  };
}

export async function getDay(store, userId, day) {
  const row = await store.get('SELECT cloves, bulb_done, bonus FROM days WHERE user_id = ? AND day = ?', userId, day);
  const rev = await store.get("SELECT COUNT(*) n FROM attempts WHERE user_id = ? AND day = ? AND mode = 'review'", userId, day);
  return { day, cloves: row?.cloves ?? 0, bulbDone: !!row?.bulb_done, bonus: row?.bonus ?? 0, size: BULB_CLOVES, reviews: rev?.n ?? 0 };
}

/**
 * Give a player an endgame rating and School state the first time they need
 * one, by replaying their attempts so far (so existing players keep credit
 * for what they've already done). Returns the user row with eg_rating set.
 */
export async function ensureEndgameRating(store, user) {
  if (user.eg_rating != null) return user;
  const rows = await store.all(
    'SELECT id, drill_id, level, success, hints, written_hints, takebacks, efficiency, lesson_replay, day FROM attempts WHERE user_id = ? ORDER BY id',
    user.id,
  );
  let rating = startingEndgameRating(user.rating);
  let games = 0;
  const school = {};
  const writes = [];
  for (const r of rows) {
    const drill = DRILL_BY_ID[r.drill_id];
    if (!drill || r.lesson_replay) continue;
    const a = { success: !!r.success, hints: r.hints, writtenHints: r.written_hints, takebacks: r.takebacks, efficiency: r.efficiency, goal: drill.goal };
    const puzzle = puzzleRating(drill, r.level);
    const res = rateAttempt({ rating, games, puzzle, score: solveScore(a), anchor: user.rating });
    writes.push(['UPDATE attempts SET eg_before = ?, eg_after = ?, puzzle_rating = ? WHERE id = ?', [res.before, res.after, puzzle, r.id]]);
    rating = res.after;
    games++;
    school[r.drill_id] = advanceSchool(school[r.drill_id], { success: a.success, counted: countsForSchool(a) }, r.day);
  }
  for (const [drillId, st] of Object.entries(school)) {
    writes.push([
      `INSERT INTO progress (user_id, drill_id, level, qualifying, clean_streak, status, review_due, review_step) VALUES (?,?,1,0,?,?,?,?)
       ON CONFLICT(user_id, drill_id) DO UPDATE SET clean_streak = excluded.clean_streak, status = excluded.status,
         review_due = excluded.review_due, review_step = excluded.review_step`,
      [user.id, drillId, st.cleanStreak, st.status, st.reviewDue, st.reviewStep],
    ]);
  }
  writes.push(['UPDATE users SET eg_rating = ?, eg_games = ? WHERE id = ?', [rating, games, user.id]]);
  for (let i = 0; i < writes.length; i += 50) await store.batch(writes.slice(i, i + 50));
  return { ...user, eg_rating: rating, eg_games: games };
}

/**
 * Validate, score and store an attempt. Returns everything the result
 * screen needs (points breakdown, level change, clove progress, achievements).
 */
export async function recordAttempt(store, user, body) {
  const drill = DRILL_BY_ID[body.drillId];
  if (!drill) throw httpError(400, 'Unknown drill');
  const day = DAY_RE.test(body.day ?? '') ? body.day : new Date().toISOString().slice(0, 10);
  user = await ensureEndgameRating(store, user);
  const progressRow = (await store.get(
    'SELECT level, qualifying, clean_streak, status, review_due, review_step FROM progress WHERE user_id = ? AND drill_id = ?',
    user.id,
    drill.id,
  )) ?? { level: 1, qualifying: 0, clean_streak: 0, status: null, review_due: null, review_step: 0 };
  const level = int(body.level, 1, Math.min(MAX_LEVEL, progressRow.level));
  const puzzle = { mateIn: body.mateIn != null ? int(body.mateIn, 1, 60) : null };
  const par = parSeconds(drill, puzzle, level);
  const success = !!body.success;
  const userMoves = int(body.userMoves, 0, 200);
  // A hold drill can also end early in a secured draw (pawn captured, stalemate,
  // repetition), so any solve needs at least one move.
  if (success && userMoves < 1) throw httpError(400, 'Not enough moves for a solve');
  const grades = {};
  for (const g of GRADES) grades[g] = int(body.grades?.[g], 0, 200);
  const attempt = {
    drill,
    level,
    success,
    durationMs: int(body.durationMs, 0, 3600e3),
    userMoves,
    wastePlies: int(body.wastePlies, 0, 2000),
    hints: int(body.hints, 0, 100),
    writtenHints: int(body.writtenHints, 0, 100),
    takebacks: int(body.takebacks, 0, 100),
    lessonReplay: !!body.lessonReplay,
    onlyMoves: int(body.onlyMoves, 0, 100),
    parSeconds: par,
  };
  const mode = ['school', 'review'].includes(body.mode) ? body.mode : null;
  const score = scoreAttempt(attempt);
  const breakdown = [...score.breakdown];
  let points = score.total;

  // Personal best: fastest seconds-per-move on this drill (after 3 solves).
  // A replay right after a lesson doesn't count: the answer was just shown.
  let pb = false;
  if (success && userMoves > 0 && !attempt.lessonReplay) {
    const prev = await store.get(
      'SELECT COUNT(*) n, MIN(duration_ms * 1.0 / MAX(user_moves,1)) best FROM attempts WHERE user_id = ? AND drill_id = ? AND success = 1',
      user.id,
      drill.id,
    );
    const spm = attempt.durationMs / userMoves;
    if (prev.n >= 3 && spm < prev.best) {
      pb = true;
      const bonus = Math.round(score.base * PB_BONUS_SHARE);
      breakdown.push({ label: 'New personal best pace', points: bonus });
      points += bonus;
    }
  }

  // Level progression (only when playing at your current level).
  const qualifies = !attempt.lessonReplay && qualifiesForLevel({ ...attempt, efficiency: score.efficiency }, level) && level === progressRow.level;
  let newLevel = progressRow.level;
  let qualifying = progressRow.qualifying;
  let levelUp = false;
  if (qualifies) {
    qualifying++;
    if (qualifying >= SOLVES_TO_LEVEL && newLevel < MAX_LEVEL) {
      newLevel++;
      qualifying = 0;
      levelUp = true;
    }
    if (newLevel === MAX_LEVEL) qualifying = Math.min(qualifying, SOLVES_TO_LEVEL);
  }

  // Endgame School: where this drill stands before the attempt. Drills in
  // your rotation (and due check-ups) are "your level".
  const egBefore = user.eg_rating;
  const curriculum = buildCurriculum({ drills: DRILLS, progress: await getProgress(store, user.id), rating: egBefore, today: day });
  const atLevel = atYourLevel(curriculum, drill.id);

  // Endgame rating (lesson replays are unrated: the answer was just shown).
  const quality = { success, hints: attempt.hints, writtenHints: attempt.writtenHints, takebacks: attempt.takebacks, efficiency: score.efficiency, goal: drill.goal };
  const puzzleR = puzzleRating(drill, level);
  const rated = !attempt.lessonReplay;
  const rating = rated
    ? rateAttempt({ rating: egBefore, games: user.eg_games ?? 0, puzzle: puzzleR, score: solveScore(quality), anchor: user.rating })
    : { before: egBefore, after: egBefore, delta: 0, puzzle: puzzleR };
  const school = rated
    ? advanceSchool(
        { cleanStreak: progressRow.clean_streak, status: progressRow.status, reviewDue: progressRow.review_due, reviewStep: progressRow.review_step },
        { success, counted: countsForSchool(quality) },
        day,
      )
    : { cleanStreak: progressRow.clean_streak ?? 0, status: progressRow.status ?? 'learning', reviewDue: progressRow.review_due, reviewStep: progressRow.review_step ?? 0, events: {} };

  // Garlick bulb: a solve fills part of a clove, depending on how hard the
  // drill is for this player (see shared/cloves.js).
  const cloveArgs = { drill, level, rating: egBefore, hints: attempt.hints, takebacks: attempt.takebacks, lessonReplay: attempt.lessonReplay, atLevel };
  let cloveGain = success ? cloveValue(cloveArgs) : 0;
  const cloveNote = success && !attempt.lessonReplay && cloveGain < 1 - EPS ? cloveShortfall(cloveArgs) : null;
  let lessonCloveCapped = false;
  if (cloveGain > 0 && attempt.lessonReplay) {
    const used = await store.get(
      'SELECT COUNT(*) n FROM attempts WHERE user_id = ? AND day = ? AND lesson_replay = 1 AND clove_gain > 0',
      user.id,
      day,
    );
    if (used.n >= LESSON_CLOVES_PER_DAY) {
      cloveGain = 0;
      lessonCloveCapped = true;
    }
  }
  const dayRow = (await store.get('SELECT cloves, bulb_done, bonus FROM days WHERE user_id = ? AND day = ?', user.id, day)) ?? {
    cloves: 0,
    bulb_done: 0,
    bonus: 0,
  };
  const cloves = dayRow.cloves + cloveGain;
  const bulbCompletedNow = !dayRow.bulb_done && cloves >= BULB_CLOVES - EPS;
  const already = (await store.all('SELECT achievement_id FROM achievements WHERE user_id = ?', user.id)).map((r) => r.achievement_id);

  const writes = [
    [
      `INSERT INTO attempts (user_id, drill_id, level, fen, success, reason, duration_ms, user_moves, waste_plies, efficiency, grades,
         hints, takebacks, only_moves, par_seconds, speed_factor, perfect, points, clove_gain, written_hints, lesson_replay,
         mode, puzzle_rating, eg_before, eg_after, breakdown, day, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        user.id,
        drill.id,
        level,
        String(body.fen ?? '').slice(0, 100),
        success ? 1 : 0,
        String(body.reason ?? '').slice(0, 60),
        attempt.durationMs,
        userMoves,
        attempt.wastePlies,
        score.efficiency,
        JSON.stringify(grades),
        attempt.hints,
        attempt.takebacks,
        attempt.onlyMoves,
        par,
        score.speedFactor,
        score.perfect ? 1 : 0,
        points,
        cloveGain,
        attempt.writtenHints,
        attempt.lessonReplay ? 1 : 0,
        mode,
        rated ? puzzleR : null,
        rated ? rating.before : null,
        rated ? rating.after : null,
        JSON.stringify(breakdown),
        day,
        Date.now(),
      ],
    ],
    [
      `INSERT INTO progress (user_id, drill_id, level, qualifying, clean_streak, status, review_due, review_step) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id, drill_id) DO UPDATE SET level = excluded.level, qualifying = excluded.qualifying,
         clean_streak = excluded.clean_streak, status = excluded.status, review_due = excluded.review_due, review_step = excluded.review_step`,
      [user.id, drill.id, newLevel, qualifying, school.cleanStreak, school.status, school.reviewDue, school.reviewStep],
    ],
  ];
  if (rated) writes.push(['UPDATE users SET eg_rating = ?, eg_games = eg_games + 1 WHERE id = ?', [rating.after, user.id]]);
  if (cloveGain > 0) {
    writes.push([
      `INSERT INTO days (user_id, day, cloves, bulb_done, bonus) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id, day) DO UPDATE SET cloves = excluded.cloves, bulb_done = excluded.bulb_done, bonus = excluded.bonus`,
      [user.id, day, cloves, dayRow.bulb_done || bulbCompletedNow ? 1 : 0, bulbCompletedNow ? BULB_BONUS : dayRow.bonus],
    ]);
  }
  await store.batch(writes);

  const totals = await getTotals(store, user.id, day);
  const ctx = {
    attempt: { drillId: drill.id, success, durationMs: attempt.durationMs, efficiency: score.efficiency, perfect: score.perfect, level, takebacks: attempt.takebacks },
    totals,
  };
  const unlocked = newlyUnlocked(ctx, already);
  const now = Date.now();
  await store.batch(unlocked.map((id) => ['INSERT OR IGNORE INTO achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)', [user.id, id, now]]));

  return {
    points,
    breakdown,
    efficiency: score.efficiency,
    speedFactor: score.speedFactor,
    perfect: score.perfect,
    parSeconds: par,
    personalBest: pb,
    cloveGain,
    cloveNote,
    lessonReplay: attempt.lessonReplay,
    lessonCloveCapped,
    rating: { rated, before: Math.round(rating.before), after: Math.round(rating.after), delta: rating.delta, puzzle: puzzleR },
    school: {
      atLevel,
      mode,
      cleanStreak: school.cleanStreak,
      needed: GRADUATE_AFTER,
      status: school.status,
      reviewDue: school.reviewDue,
      events: school.events,
    },
    progress: { level: newLevel, qualifying, levelUp, needed: SOLVES_TO_LEVEL, qualified: qualifies },
    day: { ...(await getDay(store, user.id, day)), bulbCompletedNow, bulbBonus: bulbCompletedNow ? BULB_BONUS : 0 },
    newAchievements: unlocked.map((id) => publicAchievement(ACHIEVEMENTS.find((a) => a.id === id))),
    totals: { points: totals.points, rank: totals.rank, streak: totals.streak },
  };
}

export function publicAchievement(a) {
  return { id: a.id, name: a.name, icon: a.icon, desc: a.desc };
}

export async function getAchievements(store, userId) {
  const rows = await store.all('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?', userId);
  const got = Object.fromEntries(rows.map((r) => [r.achievement_id, r.unlocked_at]));
  return ACHIEVEMENTS.map((a) => ({ ...publicAchievement(a), unlockedAt: got[a.id] ?? null }));
}

export async function getStats(store, userId, today) {
  const perDrill = await store.all(
    `SELECT drill_id, COUNT(*) attempts, SUM(success) solves, AVG(CASE WHEN success THEN efficiency END) eff,
            AVG(CASE WHEN success THEN duration_ms * 1.0 / MAX(user_moves,1) END) avg_spm,
            MIN(CASE WHEN success THEN duration_ms * 1.0 / MAX(user_moves,1) END) best_spm,
            SUM(points) points
     FROM attempts WHERE user_id = ? GROUP BY drill_id`,
    userId,
  );
  const recent = await store.all(
    `SELECT id, drill_id, level, success, reason, duration_ms, user_moves, efficiency, points, perfect, clove_gain, day, created_at
     FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 400`,
    userId,
  );
  const from = addDays(today, -29);
  const days = await store.all('SELECT day, cloves, bulb_done FROM days WHERE user_id = ? AND day >= ? ORDER BY day', userId, from);
  const ratingRows = await store.all(
    'SELECT day, eg_after FROM attempts WHERE user_id = ? AND eg_after IS NOT NULL ORDER BY id DESC LIMIT 200',
    userId,
  );
  return {
    perDrill: perDrill.map((r) => ({
      drillId: r.drill_id,
      attempts: r.attempts,
      solves: r.solves,
      successRate: r.attempts ? r.solves / r.attempts : 0,
      efficiency: r.eff,
      avgSecondsPerMove: r.avg_spm != null ? r.avg_spm / 1000 : null,
      bestSecondsPerMove: r.best_spm != null ? r.best_spm / 1000 : null,
      points: r.points,
    })),
    recent: recent.map((r) => ({
      id: r.id,
      drillId: r.drill_id,
      level: r.level,
      success: !!r.success,
      reason: r.reason,
      durationMs: r.duration_ms,
      userMoves: r.user_moves,
      efficiency: r.efficiency,
      points: r.points,
      perfect: !!r.perfect,
      cloveGain: r.clove_gain,
      day: r.day,
      createdAt: r.created_at,
    })),
    days,
    ratingHistory: ratingRows.reverse().map((r) => ({ day: r.day, rating: Math.round(r.eg_after) })),
  };
}

export async function getLeaderboard(store, today) {
  const weekFrom = addDays(today, -6);
  const users = await store.all('SELECT id, display_name, username, avatar, color, rating, rating_source, eg_rating, eg_games FROM users ORDER BY id');
  const players = [];
  for (let u of users) {
    u = await ensureEndgameRating(store, u);
    const t = await getTotals(store, u.id, today);
    const w = (await store.get('SELECT COALESCE(SUM(points),0) p FROM attempts WHERE user_id = ? AND day >= ?', u.id, weekFrom)).p;
    const wb = (await store.get('SELECT COALESCE(SUM(bonus),0) p FROM days WHERE user_id = ? AND day >= ?', u.id, weekFrom)).p;
    const d = await getDay(store, u.id, today);
    players.push({
      displayName: u.display_name,
      username: u.username,
      avatar: u.avatar,
      color: u.color,
      rating: u.rating,
      ratingSource: u.rating_source,
      egRating: u.eg_rating != null ? Math.round(u.eg_rating) : null,
      egGames: u.eg_games ?? 0,
      points: t.points,
      weekPoints: w + wb,
      solves: t.solves,
      streak: t.streak,
      bulbs: t.bulbs,
      todayCloves: d.cloves,
      rank: t.rank.name,
    });
  }
  // Family records: fastest pace (seconds per move) on each drill.
  const records = {};
  for (const d of DRILLS) {
    const r = await store.get(
      `SELECT u.display_name name, u.avatar, MIN(a.duration_ms * 1.0 / MAX(a.user_moves,1)) spm
       FROM attempts a JOIN users u ON u.id = a.user_id
       WHERE a.drill_id = ? AND a.success = 1 GROUP BY a.user_id ORDER BY spm ASC LIMIT 1`,
      d.id,
    );
    if (r) records[d.id] = { name: r.name, avatar: r.avatar, secondsPerMove: r.spm / 1000 };
  }
  return { players, records };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
