"""Pass 2: Stockfish evaluation of every position from endgame start to the end
of the game. Stores eval (White POV, centipawns; mate mapped to +-10000).
Usage: pass2_engine.py pass1.json out.json [limit_games] [nodes]
"""
import json
import os
import sys
from multiprocessing import Pool

import chess
import chess.engine

SF = os.environ.get("STOCKFISH", "/usr/games/stockfish")
NODES = int(sys.argv[4]) if len(sys.argv) > 4 else 60000
_engine = None


def init():
    global _engine
    _engine = chess.engine.SimpleEngine.popen_uci(SF)
    _engine.configure({"Threads": 1, "Hash": 32})


def score_cp(board):
    if board.is_checkmate():
        return -10000 if board.turn == chess.WHITE else 10000
    if board.is_stalemate() or board.is_insufficient_material():
        return 0
    info = _engine.analyse(board, chess.engine.Limit(nodes=NODES))
    s = info["score"].white()
    if s.is_mate():
        m = s.mate()
        return 10000 - abs(m) if m > 0 else -10000 + abs(m)
    return s.score()


def work(item):
    idx, fens = item
    out = []
    for fen in fens:
        out.append(score_cp(chess.Board(fen)))
    return idx, out


def main():
    rows = json.load(open(sys.argv[1]))
    limit = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] != "all" else None
    items = [(i, r["fens"]) for i, r in enumerate(rows) if r.get("eg")]
    if limit:
        items = items[:limit]
    print("games", len(items), "positions", sum(len(f) for _, f in items), flush=True)
    evals = {}
    with Pool(4, initializer=init) as pool:
        for n, (idx, ev) in enumerate(pool.imap_unordered(work, items, chunksize=2)):
            evals[idx] = ev
            if n % 100 == 0:
                print("done", n, flush=True)
    json.dump(evals, open(sys.argv[2], "w"))


if __name__ == "__main__":
    main()
