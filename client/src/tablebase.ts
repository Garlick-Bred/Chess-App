// Tablebase client: our server's caching proxy first, Lichess directly as a
// fallback. Results are memoised per position for the session.
export interface TbMove {
  uci: string;
  san: string;
  category: string;
  dtm: number | null;
  dtz: number | null;
  zeroing?: boolean;
}
export interface TbResult {
  category: string;
  dtm: number | null;
  dtz: number | null;
  moves: TbMove[];
}

const memo = new Map<string, Promise<TbResult>>();

function key(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

async function fetchJson(url: string): Promise<TbResult> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tablebase ${res.status}`);
  return res.json();
}

export function probe(fen: string): Promise<TbResult> {
  const k = key(fen);
  let p = memo.get(k);
  if (!p) {
    const full = `${k} 0 1`;
    p = fetchJson(`/api/tablebase?fen=${encodeURIComponent(full)}`).catch(() =>
      fetchJson(`https://tablebase.lichess.ovh/standard?fen=${encodeURIComponent(full)}`),
    );
    p.catch(() => memo.delete(k));
    memo.set(k, p);
  }
  return p;
}
