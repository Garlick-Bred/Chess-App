"""Pass 3: exact tablebase verdicts for every position where the user was to
move with <= 7 pieces on the board (Lichess Syzygy/Gaviota API).

For each such position we record the theoretical result before the move and
the result after the move the user actually played. A change for the worse is
an exact, engine-independent endgame error. Results are cached so the script
can resume.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import chess

P1, CACHE = sys.argv[1], sys.argv[2]
UA = {"User-Agent": "endgame-trainer-analysis/0.1"}
cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def probe(fen):
    if fen in cache:
        return cache[fen]
    url = "https://tablebase.lichess.ovh/standard?fen=" + urllib.parse.quote(fen)
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                data = json.load(r)
            slim = {
                "category": data.get("category"),
                "dtz": data.get("dtz"),
                "dtm": data.get("dtm"),
                "moves": [
                    {"uci": m["uci"], "san": m["san"], "category": m["category"], "dtz": m.get("dtz"), "dtm": m.get("dtm")}
                    for m in data.get("moves", [])
                ],
            }
            cache[fen] = slim
            time.sleep(0.15)
            return slim
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(60)
                continue
            time.sleep(2 * (attempt + 1))
        except Exception:
            time.sleep(2 * (attempt + 1))
    return None


def main():
    rows = json.load(open(P1))
    n = 0
    for r in rows:
        if not r.get("eg") or r.get("le7_ply") is None:
            continue
        user_white = r["user_white"]
        start = r["le7_ply"] - r["entry_ply"]
        fens = r["fens"]
        for i in range(start, len(fens) - 1):
            b = chess.Board(fens[i])
            if b.turn != (chess.WHITE if user_white else chess.BLACK) or b.is_game_over():
                continue
            if b.castling_rights:
                continue
            probe(fens[i])
            n += 1
            if n % 200 == 0:
                json.dump(cache, open(CACHE, "w"))
                print("probed", n, flush=True)
    json.dump(cache, open(CACHE, "w"))
    print("finished", n, "positions", flush=True)


if __name__ == "__main__":
    main()
