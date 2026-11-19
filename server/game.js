// Server-side game logic: record attempts, recompute points with the shared
// scoring rules, level up drills, fill Garlick cloves and unlock achievements.
import { DRILLS, DRILL_BY_ID, MAX_LEVEL, parSeconds } from '../shared/drills.js';
import { scoreAttempt, qualifiesForLevel, SOLVES_TO_LEVEL, BULB_CLOVES, BULB_BONUS, PB_BONUS_SHARE, bulbStreak, rankFor, masteryStars, addDays } from '../shared/scoring.js';
import { ACHIEVEMENTS, newlyUnlocked } from '../shared/achievements.js';
import { GRADES } from '../shared/grading.js';
import { tx } from './db.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

export function getProgress(db, userId) {
  const rows = db.prepare('SELECT drill_id, level, qualifying FROM progress WHERE user_id = ?').all(userId);
  const solves = db
    .prepare(
      `SELECT drill_id, COUNT(*) n, MIN(CASE WHEN success THEN duration_ms * 1.0 / MAX(user_moves, 1) END) best_spm,
              MIN(CASE WHEN success THEN duration_ms END) best_ms, COUNT(*) attempts, SUM(success) solves
       FROM attempts WHERE user_id = ? GROUP BY drill_id`,
    )
    .all(userId);
  const byId = Object.fromEntries(rows.map((r) => [r.drill_id, r]));
  const sById = Object.fromEntries(solves.map((r) => [r.drill_id, r]));
  const out = {};
  for (const d of DRILLS) {
    const p = byId[d.id] ?? { level: 1, qualifying: 0 };
    const s = sById[d.id] ?? {};
    const rec = {
      level: p.level,
      qualifying: p.qualifying,
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

export function getTotals(db, userId, today) {
  const a = db
    .prepare(
      `SELECT COALESCE(SUM(points),0) pts, COALESCE(SUM(success),0) solves, COALESCE(SUM(perfect),0) perfects,
              COALESCE(SUM(CASE WHEN success AND speed_factor >= 0.999 THEN 1 ELSE 0 END),0) speed_max
       FROM attempts WHERE user_id = ?`,
    )
    .get(userId);
  const b = db.prepare('SELECT COALESCE(SUM(bonus),0) bonus, COALESCE(SUM(bulb_done),0) bulbs FROM days WHERE user_id = ?').get(userId);
  const doneDays = db.prepare('SELECT day FROM days WHERE user_id = ? AND bulb_done = 1').all(userId).map((r) => r.day);
  const progress = getProgress(db, userId);
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

export function getDay(db, userId, day) {
  const row = db.prepare('SELECT cloves, bulb_done, bonus FROM days WHERE user_id = ? AND day = ?').get(userId, day);
  return { day, cloves: row?.cloves ?? 0, bulbDone: !!row?.bulb_done, bonus: row?.bonus ?? 0, size: BULB_CLOVES };
}

/**
 * Validate, score and store an attempt. Returns everything the result
 * screen needs (points breakdown, level change, clove, achievements).
 */
export function recordAttempt(db, user, body) {
  const drill = DRILL_BY_ID[body.drillId];
  if (!drill) throw httpError(400, 'Unknown drill');
  const day = DAY_RE.test(body.day ?? '') ? body.day : new Date().toISOString().slice(0, 10);
  const progressRow = db.prepare('SELECT level, qualifying FROM progress WHERE user_id = ? AND drill_id = ?').get(user.id, drill.id) ?? {
    level: 1,
    qualifying: 0,
  };
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
    takebacks: int(body.takebacks, 0, 100),
    onlyMoves: int(body.onlyMoves, 0, 100),
    parSeconds: par,
  };
  const score = scoreAttempt(attempt);
  const breakdown = [...score.breakdown];
  let points = score.total;

  // Personal best: fastest seconds-per-move on this drill (after 3 solves).
  let pb = false;
  if (success && userMoves > 0) {
    const prev = db
      .prepare('SELECT COUNT(*) n, MIN(duration_ms * 1.0 / MAX(user_moves,1)) best FROM attempts WHERE user_id = ? AND drill_id = ? AND success = 1')
      .get(user.id, drill.id);
    const spm = attempt.durationMs / userMoves;
    if (prev.n >= 3 && spm < prev.best) {
      pb = true;
      const bonus = Math.round(score.base * PB_BONUS_SHARE);
      breakdown.push({ label: 'New personal best pace', points: bonus });
      points += bonus;
    }
  }

  const qualifies = qualifiesForLevel({ ...attempt, efficiency: score.efficiency }, level) && level === progressRow.level;

  return tx(db, () => {
    const already = db.prepare('SELECT achievement_id FROM achievements WHERE user_id = ?').all(user.id).map((r) => r.achievement_id);
    db.prepare(
      `INSERT INTO attempts (user_id, drill_id, level, fen, success, reason, duration_ms, user_moves, waste_plies, efficiency, grades,
         hints, takebacks, only_moves, par_seconds, speed_factor, perfect, points, breakdown, day, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
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
      JSON.stringify(breakdown),
      day,
      Date.now(),
    );

    // Level progression.
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
    db.prepare(
      `INSERT INTO progress (user_id, drill_id, level, qualifying) VALUES (?,?,?,?)
       ON CONFLICT(user_id, drill_id) DO UPDATE SET level = excluded.level, qualifying = excluded.qualifying`,
    ).run(user.id, drill.id, newLevel, qualifying);

    // Garlick bulb: every solve fills a clove.
    let bulbCompletedNow = false;
    if (success) {
      db.prepare(`INSERT INTO days (user_id, day, cloves) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET cloves = cloves + 1`).run(user.id, day);
      const d = db.prepare('SELECT cloves, bulb_done FROM days WHERE user_id = ? AND day = ?').get(user.id, day);
      if (d.cloves >= BULB_CLOVES && !d.bulb_done) {
        db.prepare('UPDATE days SET bulb_done = 1, bonus = ? WHERE user_id = ? AND day = ?').run(BULB_BONUS, user.id, day);
        bulbCompletedNow = true;
      }
    }

    const totals = getTotals(db, user.id, day);
    const ctx = {
      attempt: { drillId: drill.id, success, durationMs: attempt.durationMs, efficiency: score.efficiency, perfect: score.perfect, level, takebacks: attempt.takebacks },
      totals,
    };
    const unlocked = newlyUnlocked(ctx, already);
    const ins = db.prepare('INSERT OR IGNORE INTO achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)');
    for (const id of unlocked) ins.run(user.id, id, Date.now());

    return {
      points,
      breakdown,
      efficiency: score.efficiency,
      speedFactor: score.speedFactor,
      perfect: score.perfect,
      parSeconds: par,
      personalBest: pb,
      progress: { level: newLevel, qualifying, levelUp, needed: SOLVES_TO_LEVEL, qualified: qualifies },
      day: { ...getDay(db, user.id, day), bulbCompletedNow, bulbBonus: bulbCompletedNow ? BULB_BONUS : 0 },
      newAchievements: unlocked.map((id) => publicAchievement(ACHIEVEMENTS.find((a) => a.id === id))),
      totals: { points: totals.points, rank: totals.rank, streak: totals.streak },
    };
  });
}

export function publicAchievement(a) {
  return { id: a.id, name: a.name, icon: a.icon, desc: a.desc };
}

export function getAchievements(db, userId) {
  const rows = db.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?').all(userId);
  const got = Object.fromEntries(rows.map((r) => [r.achievement_id, r.unlocked_at]));
  return ACHIEVEMENTS.map((a) => ({ ...publicAchievement(a), unlockedAt: got[a.id] ?? null }));
}

export function getStats(db, userId, today) {
  const perDrill = db
    .prepare(
      `SELECT drill_id, COUNT(*) attempts, SUM(success) solves, AVG(CASE WHEN success THEN efficiency END) eff,
              AVG(CASE WHEN success THEN duration_ms * 1.0 / MAX(user_moves,1) END) avg_spm,
              MIN(CASE WHEN success THEN duration_ms * 1.0 / MAX(user_moves,1) END) best_spm,
              SUM(points) points
       FROM attempts WHERE user_id = ? GROUP BY drill_id`,
    )
    .all(userId);
  const recent = db
    .prepare(
      `SELECT id, drill_id, level, success, reason, duration_ms, user_moves, efficiency, points, perfect, day, created_at
       FROM attempts WHERE user_id = ? ORDER BY id DESC LIMIT 400`,
    )
    .all(userId);
  const from = addDays(today, -29);
  const days = db.prepare('SELECT day, cloves, bulb_done FROM days WHERE user_id = ? AND day >= ? ORDER BY day').all(userId, from);
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
      day: r.day,
      createdAt: r.created_at,
    })),
    days,
  };
}

export function getLeaderboard(db, today) {
  const weekFrom = addDays(today, -6);
  const users = db.prepare('SELECT id, display_name, username, avatar, color FROM users ORDER BY id').all();
  const board = users.map((u) => {
    const t = getTotals(db, u.id, today);
    const w = db.prepare('SELECT COALESCE(SUM(points),0) p FROM attempts WHERE user_id = ? AND day >= ?').get(u.id, weekFrom).p;
    const wb = db.prepare('SELECT COALESCE(SUM(bonus),0) p FROM days WHERE user_id = ? AND day >= ?').get(u.id, weekFrom).p;
    const d = getDay(db, u.id, today);
    return {
      displayName: u.display_name,
      username: u.username,
      avatar: u.avatar,
      color: u.color,
      points: t.points,
      weekPoints: w + wb,
      solves: t.solves,
      streak: t.streak,
      bulbs: t.bulbs,
      todayCloves: d.cloves,
      rank: t.rank.name,
    };
  });
  // Family records: fastest pace (seconds per move) on each drill.
  const records = {};
  for (const d of DRILLS) {
    const r = db
      .prepare(
        `SELECT u.display_name name, u.avatar, MIN(a.duration_ms * 1.0 / MAX(a.user_moves,1)) spm
         FROM attempts a JOIN users u ON u.id = a.user_id
         WHERE a.drill_id = ? AND a.success = 1 GROUP BY a.user_id ORDER BY spm ASC LIMIT 1`,
      )
      .get(d.id);
    if (r) records[d.id] = { name: r.name, avatar: r.avatar, secondsPerMove: r.spm / 1000 };
  }
  return { players: board, records };
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
