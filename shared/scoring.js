// Points, levels, ranks and the daily Garlick bulb. Pure functions so the
// server can recompute everything the client shows.
import { efficiency } from './grading.js';
import { MAX_LEVEL } from './drills.js';

export const BULB_CLOVES = 5;
export const BULB_BONUS = 50;
export const PB_BONUS_SHARE = 0.1;

export function levelMultiplier(level) {
  return 1 + 0.25 * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
}

/**
 * Score a finished attempt.
 *
 * Solve points  = drill base x level multiplier
 * Accuracy bonus= up to +50% of base, scaled by efficiency squared
 * Speed bonus   = up to +50% of base: full at <= half par, half at par, zero at 1.5x par
 * Perfect bonus = +25% if every move kept full pace and no hints/takebacks
 * Only-move     = +5% of base per "only move" found when defending (max +25%)
 * Penalties     = -10% per written hint, -20% per piece hint, -25% per takeback
 * Lesson replay = the position was just shown in a lesson: half points, no
 *                 perfect bonus (the clove reward is handled in cloves.js)
 * A solve always earns at least 20% of base. A failed attempt earns 0.
 */
export function scoreAttempt(a) {
  const { drill, level, success, durationMs, userMoves, wastePlies = 0, hints = 0, writtenHints = 0, takebacks = 0, onlyMoves = 0, parSeconds, lessonReplay = false } = a;
  const base = Math.round(drill.basePoints * levelMultiplier(level));
  const eff = drill.goal === 'hold' ? 1 : efficiency(userMoves, wastePlies);
  const seconds = durationMs / 1000;
  const speedFactor = parSeconds > 0 ? clamp(1.5 - seconds / parSeconds, 0, 1) : 0;
  const perfect = success && !lessonReplay && eff >= 0.999 && hints === 0 && writtenHints === 0 && takebacks === 0;
  const breakdown = [];
  if (!success) {
    return { total: 0, base, efficiency: eff, speedFactor, perfect: false, breakdown: [{ label: 'Not solved', points: 0 }] };
  }
  breakdown.push({ label: `Solved (level ${level})`, points: base });
  const accuracy = Math.round(base * 0.5 * eff * eff);
  if (drill.goal !== 'hold') breakdown.push({ label: `Efficiency ${Math.round(eff * 100)}%`, points: accuracy });
  const speed = Math.round(base * 0.5 * speedFactor);
  breakdown.push({ label: `Speed (${seconds.toFixed(1)}s / par ${parSeconds}s)`, points: speed });
  let only = 0;
  if (drill.goal === 'hold' && onlyMoves > 0) {
    only = Math.round(base * Math.min(0.25, 0.05 * onlyMoves));
    breakdown.push({ label: `Only moves found x${onlyMoves}`, points: only });
  }
  const perfectBonus = perfect ? Math.round(base * 0.25) : 0;
  if (perfect) breakdown.push({ label: 'Perfect play', points: perfectBonus });
  const writtenPenalty = Math.round(base * 0.1 * writtenHints);
  if (writtenHints) breakdown.push({ label: `Written hints x${writtenHints}`, points: -writtenPenalty });
  const hintPenalty = Math.round(base * 0.2 * hints);
  if (hints) breakdown.push({ label: `Piece hints x${hints}`, points: -hintPenalty });
  const takebackPenalty = Math.round(base * 0.25 * takebacks);
  if (takebacks) breakdown.push({ label: `Takebacks x${takebacks}`, points: -takebackPenalty });
  let raw = base + (drill.goal === 'hold' ? 0 : accuracy) + speed + only + perfectBonus - writtenPenalty - hintPenalty - takebackPenalty;
  const floor = Math.round(base * 0.2);
  let total = Math.max(floor, raw);
  if (lessonReplay) {
    const half = Math.round(total / 2);
    breakdown.push({ label: 'Replay after lesson x1/2', points: half - total });
    total = half;
  }
  return { total, base, efficiency: eff, speedFactor, perfect, breakdown };
}

/**
 * Level progression for one drill. You move up after 3 qualifying solves at
 * your current level. Levels 1-3 need >= 70% efficiency (no takebacks).
 * Levels 4-5 are speed levels: you must also beat par.
 */
export const SOLVES_TO_LEVEL = 3;

export function qualifiesForLevel(attempt, level) {
  if (!attempt.success || attempt.takebacks > 0) return false;
  if (attempt.efficiency < 0.7) return false;
  if (level >= 4 && attempt.durationMs / 1000 > attempt.parSeconds) return false;
  return true;
}

/** Mastery stars 0-5 for a drill from its progress record. */
export function masteryStars(p) {
  if (!p || !p.solves) return 0;
  let s = 1;
  if (p.level >= 2) s = 2;
  if (p.level >= 3) s = 3;
  if (p.level >= 4) s = 4;
  if (p.level >= 5 && p.qualifying >= SOLVES_TO_LEVEL) s = 5;
  return s;
}

export const RANKS = [
  { min: 0, name: 'Sprout' },
  { min: 250, name: 'Seedling' },
  { min: 750, name: 'Clove' },
  { min: 2000, name: 'Bulb' },
  { min: 5000, name: 'Braid' },
  { min: 10000, name: 'Garlick Knight' },
  { min: 20000, name: 'Garlick Grandmaster' },
];

export function rankFor(points) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (points >= RANKS[i].min) idx = i;
  const next = RANKS[idx + 1];
  return {
    name: RANKS[idx].name,
    index: idx,
    next: next ? next.name : null,
    progress: next ? (points - RANKS[idx].min) / (next.min - RANKS[idx].min) : 1,
    toNext: next ? next.min - points : 0,
  };
}

/** Consecutive days (ending today or yesterday) with a completed bulb. */
export function bulbStreak(completedDays, today) {
  const set = new Set(completedDays);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function addDays(isoDay, delta) {
  const [y, m, d] = isoDay.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.toISOString().slice(0, 10);
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}
