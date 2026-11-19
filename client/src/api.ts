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

/** Local calendar day (YYYY-MM-DD) - the garlic bulb resets at local midnight. */
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
  settings: Settings;
}

export interface Rank {
  name: string;
  index: number;
  next: string | null;
  progress: number;
  toNext: number;
}

export interface Totals {
  points: number;
  solves: number;
  perfects: number;
  bulbs: number;
  streak: number;
  rank: Rank;
  solvesByDrill: Record<string, number>;
  levelByDrill: Record<string, number>;
}

export interface DayInfo {
  day: string;
  cloves: number;
  bulbDone: boolean;
  bonus: number;
  size: number;
}

export interface DrillProgress {
  level: number;
  qualifying: number;
  solves: number;
  attempts: number;
  bestSecondsPerMove: number | null;
  bestMs: number | null;
  stars: number;
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
  progress: { level: number; qualifying: number; levelUp: boolean; needed: number; qualified: boolean };
  day: DayInfo & { bulbCompletedNow: boolean; bulbBonus: number };
  newAchievements: { id: string; name: string; icon: string; desc: string }[];
  totals: { points: number; rank: Rank; streak: number };
}
