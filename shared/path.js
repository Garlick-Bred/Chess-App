// The Garlick Path: points move you along a map of stages, like a level map in
// a puzzle game. Seven themed worlds of STAGES_PER_WORLD stages each (1-1 to
// 7-5), then endless Legend stages. Each stage costs a few more points than
// the one before, so early stages come quickly and later ones take days.
//
// The path is separate from the endgame rating: points reward effort and
// consistency (solving, harder drills, speed, streaks); the rating measures
// skill.

export const STAGES_PER_WORLD = 5;

/** Points to clear stage number `i` (0 = stage 1-1). 100, 140, 180, ... capped. */
export function stageCost(i) {
  return Math.min(1500, 100 + 40 * i);
}

export const WORLDS = [
  { name: 'Garlic Patch', icon: '🌱', tagline: 'Where every clove begins', bg: ['#2f4a22', '#1a2614'], accent: '#95c95e', board: ['#8fb565', '#7aa152'], landmark: 'garlic', deco: ['🌱', '🧄', '🌿', '🐌'] },
  { name: 'Pawn Village', icon: '🏘️', tagline: 'Little steps, big promotions', bg: ['#5a3b22', '#2a1c12'], accent: '#f0a35a', board: ['#d2a878', '#bf9264'], landmark: '🏘️', deco: ['♟️', '🏠', '🧺', '🐓'] },
  { name: 'Rook Towers', icon: '🏰', tagline: 'Cut them off, close the box', bg: ['#3b4654', '#1c222a'], accent: '#9fc3e8', board: ['#a9b2bd', '#959fab'], landmark: '🏰', deco: ['♜', '🧱', '🦅', '⚔️'] },
  { name: "Bishop's Cathedral", icon: '⛪', tagline: 'Long diagonals, quiet power', bg: ['#4a2f5e', '#1f1529'], accent: '#c9a2f2', board: ['#b29ad0', '#9d84bd'], landmark: '⛪', deco: ['♝', '🕯️', '🔔', '📜'] },
  { name: "Knight's Forest", icon: '🌲', tagline: 'Hop, fork and find the way', bg: ['#1f4a43', '#0d201d'], accent: '#5fd0b5', board: ['#6aa58d', '#58937b'], landmark: '🌲', deco: ['♞', '🌲', '🦉', '🍄'] },
  { name: "Queen's Palace", icon: '👑', tagline: 'Power with precision', bg: ['#5e2230', '#260d14'], accent: '#f7c631', board: ['#d08a8f', '#bd7479'], landmark: '👑', deco: ['♛', '💎', '🏺', '🌹'] },
  { name: 'Grandmaster Summit', icon: '🏔️', tagline: 'The view from the top', bg: ['#2c4a66', '#111b26'], accent: '#bfe3ff', board: ['#c3d8ec', '#adc6df'], landmark: '🏔️', deco: ['🏔️', '❄️', '🦅', '⭐'] },
];

/** Worlds after the seventh: endless Legend worlds. */
export const LEGEND = { name: 'Legend', icon: '🌟', tagline: 'Beyond the summit', bg: ['#3a3020', '#14100a'], accent: '#ffd76a', board: ['#cfb25c', '#b99c48'], landmark: '🏆', deco: ['🌟', '✨', '🏆', '🧄'] };

export function worldInfo(world) {
  if (world <= WORLDS.length) return { ...WORLDS[world - 1], number: world };
  return { ...LEGEND, name: `Legend ${world - WORLDS.length}`, number: world };
}

/** Points needed to reach the start of stage index `i`. */
export function stageStart(i) {
  let total = 0;
  for (let k = 0; k < i; k++) total += stageCost(k);
  return total;
}

export function stageLabel(i) {
  return `${Math.floor(i / STAGES_PER_WORLD) + 1}-${(i % STAGES_PER_WORLD) + 1}`;
}

/**
 * Where a points total puts you on the path.
 * @returns {{ index: number, label: string, world: number, stage: number, worldInfo: object,
 *   start: number, cost: number, into: number, toNext: number, progress: number, nextLabel: string, nextIsNewWorld: boolean }}
 */
export function pathFor(points) {
  const p = Math.max(0, Math.floor(points || 0));
  let i = 0;
  let start = 0;
  while (p >= start + stageCost(i) && i < 10000) {
    start += stageCost(i);
    i++;
  }
  const cost = stageCost(i);
  const world = Math.floor(i / STAGES_PER_WORLD) + 1;
  return {
    index: i,
    label: stageLabel(i),
    world,
    stage: (i % STAGES_PER_WORLD) + 1,
    worldInfo: worldInfo(world),
    start,
    cost,
    into: p - start,
    toNext: start + cost - p,
    progress: (p - start) / cost,
    nextLabel: stageLabel(i + 1),
    nextIsNewWorld: (i + 1) % STAGES_PER_WORLD === 0,
  };
}

/** What changed on the path between two points totals (for the result screen). */
export function pathChange(before, after) {
  const a = pathFor(before);
  const b = pathFor(after);
  return {
    before: a,
    after: b,
    stagesGained: b.index - a.index,
    newWorld: b.world > a.world,
  };
}

// ---- Bonus points that feed the path ------------------------------------

/** Solving a puzzle rated above your endgame rating: up to +50% of base at 400+ above. */
export function challengeBonus(base, puzzleRating, rating) {
  if (rating == null || puzzleRating == null) return 0;
  const k = Math.max(0, Math.min(1, (puzzleRating - rating) / 400));
  return Math.round(base * 0.5 * k);
}

/** Solves in a row without a failure: from the 3rd, +10% of base per solve, max +50%. */
export function comboBonus(base, solvesInARow) {
  const k = Math.max(0, Math.min(0.5, 0.1 * (solvesInARow - 2)));
  return Math.round(base * k);
}

/** The full-bulb bonus grows with your daily streak: 50, +10 a day, max 150. */
export function bulbBonusFor(streakBefore) {
  return 50 + 10 * Math.max(0, Math.min(10, streakBefore));
}
