// Caching proxy for the Lichess endgame tablebase (Syzygy 7-piece, Gaviota
// DTM for <= 5 pieces). Positions repeat a lot in drills, so the cache keeps
// us fast and polite to Lichess.
const DEFAULT_ENDPOINT = 'https://tablebase.lichess.ovh/standard';
const FEN_RE = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d+ \d+$/;
const inflight = new Map();

export function validFen(fen) {
  if (!FEN_RE.test(fen)) return false;
  const pieces = fen.split(' ')[0].replace(/[^a-zA-Z]/g, '').length;
  return pieces <= 7;
}

function slim(d) {
  return {
    category: d.category,
    dtm: d.dtm,
    dtz: d.dtz,
    checkmate: d.checkmate,
    stalemate: d.stalemate,
    insufficient_material: d.insufficient_material,
    moves: (d.moves ?? []).map((m) => ({
      uci: m.uci,
      san: m.san,
      category: m.category,
      dtm: m.dtm,
      dtz: m.dtz,
      zeroing: m.zeroing,
      checkmate: m.checkmate,
      stalemate: m.stalemate,
    })),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function lookup(store, fen, endpoint = DEFAULT_ENDPOINT) {
  // Normalise move counters so equal positions share a cache entry.
  const parts = fen.split(' ');
  const key = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
  const row = await store.get('SELECT data FROM tb_cache WHERE fen = ?', key);
  if (row) return JSON.parse(row.data);
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const url = `${endpoint}?fen=${encodeURIComponent(`${key} 0 1`)}`;
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'garlick-endgames/0.2 (family endgame trainer)' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.status === 429) {
          lastErr = new Error('rate limited');
          await sleep(1500 * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new Error(`tablebase HTTP ${res.status}`);
        const data = slim(await res.json());
        await store.run('INSERT OR REPLACE INTO tb_cache (fen, data, fetched_at) VALUES (?, ?, ?)', key, JSON.stringify(data), Date.now());
        return data;
      } catch (e) {
        lastErr = e;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}
