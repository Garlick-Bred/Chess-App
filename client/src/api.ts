// Thin JSON client for the server API.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
};

/** Local calendar day (YYYY-MM-DD) - the Garlick bulb resets at local midnight. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface Settings {
  playAs: 'white' | 'black' | 'random';
  sound: boolean;
  coordinates: boolean;
  autoQueen: boolean;
  chesscom?: string;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  avatar: string;
  color: string;
  rating: number | null;
  ratingSource: string | null;
  /** Endgame rating (Elo-style, same scale as a chess rating). */
  egRating: number | null;
  egGames: number;
  settings: Settings;
}

export interface Config {
  inviteRequired: boolean;
  avatars: string[];
  ratingSources: Record<string, string>;
}

/** A world on the Garlick Path (shared/path.js). */
export interface WorldInfo {
  number: number;
  name: string;
  icon: string;
  tagline: string;
  bg: [string, string];
  accent: string;
  deco: string[];
}

/** Where a points total puts you on the Garlick Path. */
export interface PathInfo {
  index: number;
  label: string;
  world: number;
  stage: number;
  worldInfo: WorldInfo;
  start: number;
  cost: number;
  into: number;
  toNext: number;
  progress: number;
  nextLabel: string;
  nextIsNewWorld: boolean;
}

export interface Totals {
  points: number;
  solves: number;
  perfects: number;
  bulbs: number;
  streak: number;
  /** Streak shields held, and the braid (cloves beyond the full bulb) weaving the next one. */
  shields: number;
  maxShields: number;
  braid: number;
  braidSize: number;
  /** Yesterday was missed with no shield: a double bulb today repairs the streak. */
  repair: { streak: number; cloves: number } | null;
  /** The latest day (in the last few) a shield covered, if any. */
  shieldUsedOn: string | null;
  golden: number;
  path: PathInfo;
  solvesByDrill: Record<string, number>;
  levelByDrill: Record<string, number>;
}

export interface DayInfo {
  day: string;
  cloves: number;
  bulbDone: boolean;
  bonus: number;
  size: number;
  /** Endgame School check-ups played today. */
  reviews: number;
}

export interface DrillProgress {
  level: number;
  qualifying: number;
  solves: number;
  attempts: number;
  bestSecondsPerMove: number | null;
  bestMs: number | null;
  stars: number;
  /** Endgame School: clean solves in a row, and graduation/check-up state. */
  cleanStreak: number;
  status: 'learning' | 'graduated';
  reviewDue: string | null;
  reviewStep: number;
}

export interface Me {
  user: User;
  totals: Totals;
  today: DayInfo;
  progress: Record<string, DrillProgress>;
}

export interface AttemptResult {
  points: number;
  breakdown: { label: string; points: number }[];
  efficiency: number;
  speedFactor: number;
  perfect: boolean;
  parSeconds: number;
  personalBest: boolean;
  cloveGain: number;
  lessonReplay?: boolean;
  lessonCloveCapped?: boolean;
  /** Why the solve filled less than a whole clove, if it did. */
  cloveNote?: string | null;
  golden: { points: number; total: number } | null;
  braid: { braid: number; shields: number; earned: number; size: number; max: number };
  repaired: { streak: number } | null;
  rating: { rated: boolean; before: number; after: number; delta: number; puzzle: number };
  school: {
    atLevel: boolean;
    mode: 'school' | 'review' | null;
    cleanStreak: number;
    needed: number;
    status: 'learning' | 'graduated';
    reviewDue: string | null;
    events: { graduated?: boolean; reviewPassed?: boolean; recheck?: boolean; demoted?: boolean };
  };
  progress: { level: number; qualifying: number; levelUp: boolean; needed: number; qualified: boolean };
  day: DayInfo & { bulbCompletedNow: boolean; bulbBonus: number; streakBefore?: number };
  newAchievements: { id: string; name: string; icon: string; desc: string }[];
  totals: { points: number; path: PathInfo; streak: number; shields: number };
  path: { before: PathInfo; after: PathInfo; stagesGained: number; newWorld: boolean };
}
