// Achievement definitions. An icon of 'garlick-N' is drawn as a Garlick bulb
// with N cloves filled; anything else is an emoji.
// `check` receives a context built by the server
// after each attempt:
//   ctx.attempt  - the attempt just finished (drillId, success, durationMs, efficiency, perfect, level, takebacks)
//   ctx.totals   - { solves, perfects, points, speedMax, bulbs, streak, golden,
//                    solvesByDrill: {id:n}, levelByDrill: {id:n}, drillCount }
//   ctx.events   - { golden, shieldEarned, repaired } for this attempt

const solved = (ctx, id) => (ctx.totals.solvesByDrill[id] ?? 0);
const lvl = (ctx, id) => (ctx.totals.levelByDrill[id] ?? 1);
const just = (ctx, id) => ctx.attempt && ctx.attempt.success && ctx.attempt.drillId === id;

export const ACHIEVEMENTS = [
  { id: 'first-solve', name: 'First Clove', icon: 'garlick-1', desc: 'Solve your first drill.', check: (c) => c.totals.solves >= 1 },
  { id: 'queen-speed', name: 'Lightning Queen', icon: '⚡', desc: 'Mate with king + queen in under 15 seconds.', check: (c) => just(c, 'kqk') && c.attempt.durationMs < 15000 },
  { id: 'ladder', name: 'Up the Ladder', icon: '🪜', desc: 'Solve the two-rook ladder mate 5 times.', check: (c) => solved(c, 'krrk') >= 5 },
  { id: 'rook-10', name: 'Rook Roller', icon: '♜', desc: 'Solve the rook mate 10 times.', check: (c) => solved(c, 'krk') >= 10 },
  { id: 'box-master', name: 'Box Master', icon: '📦', desc: 'Reach level 5 in the rook mate.', check: (c) => lvl(c, 'krk') >= 5 },
  { id: 'escort', name: 'Royal Escort', icon: '👑', desc: 'Promote a pawn 10 times in Escort the Pawn.', check: (c) => solved(c, 'kpk-win') >= 10 },
  { id: 'opposition', name: 'Opposition Expert', icon: '🛡️', desc: 'Hold the opposition defence 10 times.', check: (c) => solved(c, 'kpk-draw') >= 10 },
  { id: 'q-vs-p', name: 'Pawn Stopper', icon: '✋', desc: 'Beat a pawn on the 7th with your queen.', check: (c) => solved(c, 'kqkp') >= 1 },
  { id: 'bishop-pair', name: 'Bishop Pair', icon: '⛪', desc: 'Mate with two bishops.', check: (c) => solved(c, 'kbbk') >= 1 },
  { id: 'bridge', name: 'Bridge Builder', icon: '🌉', desc: 'Win the Lucena position.', check: (c) => solved(c, 'lucena') >= 1 },
  { id: 'philidor', name: "Philidor's Wall", icon: '🧱', desc: 'Hold the Philidor defence.', check: (c) => solved(c, 'philidor') >= 1 },
  { id: 'q-vs-r', name: 'Queen Beats Rook', icon: '⚔️', desc: 'Win queen vs rook.', check: (c) => solved(c, 'kqkr') >= 1 },
  { id: 'kbn', name: 'The W Manoeuvre', icon: '🐴', desc: 'Mate with bishop + knight.', check: (c) => solved(c, 'kbnk') >= 1 },
  { id: 'kbn-master', name: 'Bishop & Knight Master', icon: '🏆', desc: 'Mate with bishop + knight at level 3+ with 80%+ efficiency.', check: (c) => just(c, 'kbnk') && c.attempt.level >= 3 && c.attempt.efficiency >= 0.8 },
  { id: 'perfect', name: 'Perfectionist', icon: '💎', desc: 'Solve a drill with perfect play: no wasted moves, no hints.', check: (c) => c.totals.perfects >= 1 },
  { id: 'perfect-10', name: 'Flawless Ten', icon: '✨', desc: '10 perfect solves.', check: (c) => c.totals.perfects >= 10 },
  { id: 'speed-10', name: 'Speed Demon', icon: '🏎️', desc: 'Earn the full speed bonus 10 times.', check: (c) => c.totals.speedMax >= 10 },
  { id: 'comeback', name: 'Comeback Kid', icon: '↩️', desc: 'Solve a drill after taking back a blunder.', check: (c) => c.attempt && c.attempt.success && c.attempt.takebacks > 0 },
  { id: 'all-rounder', name: 'All-Rounder', icon: '🌈', desc: 'Solve every drill at least once.', check: (c) => Object.keys(c.totals.solvesByDrill).length >= c.totals.drillCount },
  { id: 'bulb-1', name: 'Full Bulb', icon: 'garlick-5', desc: 'Complete a daily Garlick bulb (5 solves in a day).', check: (c) => c.totals.bulbs >= 1 },
  { id: 'streak-3', name: 'Garlick Streak: 3', icon: '🔥', desc: 'Complete the bulb 3 days in a row.', check: (c) => c.totals.streak >= 3 },
  { id: 'streak-7', name: 'Garlick Streak: 7', icon: '🔥', desc: 'Complete the bulb 7 days in a row.', check: (c) => c.totals.streak >= 7 },
  { id: 'streak-30', name: 'Garlick Streak: 30', icon: '🌋', desc: 'Complete the bulb 30 days in a row.', check: (c) => c.totals.streak >= 30 },
  { id: 'golden-1', name: 'Golden Touch', icon: '✨', desc: 'Find your first golden clove.', check: (c) => (c.totals.golden ?? 0) >= 1 },
  { id: 'golden-10', name: 'Golden Hoard', icon: '👑', desc: 'Collect 10 golden cloves.', check: (c) => (c.totals.golden ?? 0) >= 10 },
  { id: 'shield-1', name: 'Braided Shield', icon: '🛡️', desc: 'Weave a streak shield from extra cloves.', check: (c) => !!c.events?.shieldEarned },
  { id: 'repair-1', name: 'Second Wind', icon: '💨', desc: 'Repair a broken streak with a double bulb.', check: (c) => !!c.events?.repaired },
  { id: 'cloves-100', name: 'Clove Collector', icon: '🧺', desc: 'Solve 100 drills.', check: (c) => c.totals.solves >= 100 },
  { id: 'world-2', name: 'Pawn Village', icon: '🏘️', desc: 'Reach World 2 on the Garlick Path.', check: (c) => (c.totals.path?.world ?? 1) >= 2 },
  { id: 'world-4', name: "Bishop's Cathedral", icon: '⛪', desc: 'Reach World 4 on the Garlick Path.', check: (c) => (c.totals.path?.world ?? 1) >= 4 },
  { id: 'world-7', name: 'Grandmaster Summit', icon: '🏔️', desc: 'Reach World 7 on the Garlick Path.', check: (c) => (c.totals.path?.world ?? 1) >= 7 },
  { id: 'points-1k', name: 'Four Digits', icon: '💯', desc: 'Earn 1,000 points.', check: (c) => c.totals.points >= 1000 },
  { id: 'points-10k', name: 'Garlick Royalty', icon: '🏰', desc: 'Earn 10,000 points.', check: (c) => c.totals.points >= 10000 },
];

export function newlyUnlocked(ctx, alreadyUnlocked) {
  const have = new Set(alreadyUnlocked);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.check(ctx)).map((a) => a.id);
}
