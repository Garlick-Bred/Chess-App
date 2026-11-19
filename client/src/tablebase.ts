// Tablebase client. Asks our server's caching proxy first; if that hasn't
// answered within RACE_AFTER_MS (or fails), also asks Lichess directly from
// the browser and takes whichever answer comes first. Results are memoised
// for the session, and `prefetch` warms likely next positions while you think.
export interface TbMove {
  uci: string;
  san: string;
  category: string;
  dtm: number | null;
  dtz: number | null;
  zeroing?: boolean;
  stalemate?: boolean;
  checkmate?: boolean;
}
export interface TbResult {
  category: string;
  dtm: number | null;
  dtz: number | null;
  moves: TbMove[];
}

const RACE_AFTER_MS = 600;
const memo = new Map<string, Promise<TbResult>>();

function key(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

async function fetchJson(url: string): Promise<TbResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tablebase ${res.status}`);
  return res.json();
}

function race(full: string): Promise<TbResult> {
  const serverUrl = `/api/tablebase?fen=${encodeURIComponent(full)}`;
  const directUrl = `https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(full)}`;
  return new Promise<TbResult>((resolve, reject) => {
    let done = false;
    let pending = 0;
    let directStarted = false;
    const attempt = (p: Promise<TbResult>) => {
      pending++;
      p.then(
        (r) => {
          if (!done) {
            done = true;
            resolve(r);
          }
        },
        (e) => {
          pending--;
          if (done) return;
          if (!directStarted) startDirect();
          else if (pending === 0) {
            done = true;
            reject(e);
          }
        },
      );
    };
    const startDirect = () => {
      if (directStarted || done) return;
      directStarted = true;
      attempt(fetchJson(directUrl));
    };
    attempt(fetchJson(serverUrl));
    setTimeout(startDirect, RACE_AFTER_MS);
  });
}

export function probe(fen: string): Promise<TbResult> {
  const k = key(fen);
  let p = memo.get(k);
  if (!p) {
    p = race(`${k} 0 1`);
    p.catch(() => memo.delete(k));
    memo.set(k, p);
  }
  return p;
}

/** Warm the cache for positions the game is likely to reach next. */
export function prefetch(fens: string[]) {
  for (const f of fens) void probe(f).catch(() => undefined);
}

export function isCached(fen: string) {
  return memo.has(key(fen));
}
