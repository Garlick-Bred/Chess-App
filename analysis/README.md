# Chess.com endgame analysis

Finds which endgames a player reaches most and where they lose points, using
python-chess, Stockfish and the Lichess tablebase. The output feeds the app's
"Recommended for you" cards via `shared/insights.json`.

## Pipeline

| Step | Script | What it does |
|---|---|---|
| 0 | `fetch_games.sh` | Downloads every monthly archive from the public chess.com API |
| 1 | `pass1_parse.py` | Replays each game, finds where the endgame starts (6 or fewer non-pawn, non-king pieces, the rule Lichess uses), and records material, clocks and results |
| 2 | `pass2_engine.py` | Stockfish evaluation (60k nodes) of every position from the start of the endgame to the end of the game |
| 3 | `pass3_tablebase.py` | Exact tablebase verdict for every move the player made with 7 or fewer pieces on the board (cached, resumable) |
| 4 | `report.py` | Score vs Stockfish expectation per endgame type, conversion and save rates, time trouble, stalemates, tablebase errors, and recommendations |

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install chess
sudo apt-get install stockfish            # or set STOCKFISH=/path/to/stockfish
U=your_username; D=/tmp/cc-$U
analysis/fetch_games.sh $U $D
.venv/bin/python analysis/pass1_parse.py $D/archives $D/pass1.json $U
.venv/bin/python analysis/pass2_engine.py $D/pass1.json $D/pass2.json all 60000
.venv/bin/python analysis/pass3_tablebase.py $D/pass1.json $D/tb_cache.json
.venv/bin/python analysis/report.py $D/pass1.json $D/pass2.json $D/tb_cache.json $D/report $U
```

With 4 cores and about 1,800 games, pass 2 takes about 15 minutes. Pass 3
depends on how many games reach 7 or fewer pieces (about 3,000 lookups for
ham_sandmitch) and on Lichess rate limits.

## Definitions

* **Endgame start:** the first position with 6 or fewer queens, rooks, bishops
  and knights in total.
* **Endgame types** (Rook, Pawn, Rook + minor, Pieces vs pawns, …): every type
  a game passes through for at least 4 plies. Performance is measured from the
  moment that type was reached.
* **Expected score:** Stockfish's evaluation at that moment, converted to
  winning chances with Lichess's formula `2/(1+e^(-0.00368208·cp)) − 1`.
  "Points vs expected" is actual score minus that expectation.
* **Winning / losing:** evaluation at least +2.00 or at most −2.00 for the player.
* **Blunder (engine):** a drop of more than 0.3 in winning chances, the
  Lichess threshold.
* **Tablebase error:** a move that changed the exact result (win → draw/loss,
  draw → loss).
