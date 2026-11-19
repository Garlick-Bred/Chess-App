# Design: how moves are judged, scored and rewarded

This is the answer to "when should a move be penalised and when not?". Everything
below is implemented in `shared/grading.js` and `shared/scoring.js`, which both the
browser and the server import, so what you see is exactly what gets scored.

## 1. Ground truth: a tablebase, not an engine and not an LLM

Every drill position has 5 or fewer pieces. For those, the
[Lichess tablebase](https://tablebase.lichess.ovh) gives the **exact** result
(win, draw or loss) and the **distance to mate (DTM)** for every legal move. This
is perfect knowledge, not an estimate. A chess engine like Stockfish only
estimates, and a language model is worse still: it can invent moves and
evaluations (see [RESEARCH.md](RESEARCH.md)). For 6–7 pieces the tablebase gives
distance-to-zeroing (DTZ) instead of DTM, and the app falls back to that.

## 2. The penalty policy

| What happened | Grade | Consequence |
|---|---|---|
| The move **changes the result** (win → draw/loss, or draw → loss) | ?? Blunder | The only thing that fails a drill. You can take it back for −25% of the base points. |
| Keeps the result, **as fast as perfect play** (waste 0) | ★ Best | Full credit |
| Keeps the result, **one move slower** than perfect (waste 2 plies) | ✓ Good | Small efficiency cost |
| Keeps the result but **goes backwards 2–3 moves** (waste 4–6 plies) | ?! Inaccuracy | Bigger efficiency cost |
| Keeps the result but **goes backwards 4+ moves** (waste 8+ plies) | ? Mistake | Large efficiency cost |
| Defending: the **only** move that holds the draw | ! Only move | +5% bonus each (max +25%) |

`waste = (distance after your move) − (best possible distance after any move)`,
measured in plies (half-moves).

### Why a non-optimal move is never "wrong" on its own

Perfect DTM play is not how humans win endgames. The box method in K+R vs K
wastes moves compared with a tablebase but works every time, and it's what you
should learn. So individual non-optimal moves cost points **smoothly** through
efficiency and never fail you:

```
wasted moves W = sum(waste) / 2
efficiency     = (moves played − W) / moves played
```

### Moves that don't progress at all: stall detection

Some moves don't just lose a tempo; they go nowhere. That's measured over a
**window**, not per move: if the distance to mate hasn't shrunk over your last 5
moves, the app shows *"Going in circles?"* and suggests the plan or a hint. It
doesn't take extra points, because the efficiency score has already charged for
those moves. Coaching rather than double-penalising is deliberate.

### Hard limits

* **Move cap** for winning drills: `min(50, optimal + max(8, ⌈0.75 × optimal⌉))`.
  A mate in 8 gives you 16 moves. Bishop + knight (up to 33) is capped by the real
  50-move rule.
* **Draw by rule**: stalemate, insufficient material, threefold repetition or the
  50-move rule ends a winning drill as a failure, just as it would in a game.
  In practice the stalemating move is itself graded a blunder (the tablebase
  sees the win turn into a draw), so you get the *"Stalemate! … leaves the king
  with no legal moves"* dialog and can take it back.

### The conversion allowance

A move that **completes the goal** (mate, promotion, or winning the last enemy
piece while keeping the win) always counts as Best, even if DTM says a different
move mates sooner. Chess Tempo's tablebase trainer uses a similar allowance.

### DTZ caveat (6–7 pieces)

DTZ measures moves until the next capture or pawn move, not until mate.
DTZ-optimal play can look odd (it rushes to capture or push), so with DTZ any
zeroing move that keeps the win counts as progress.

### Worked example (K+R vs K, mate in 14 = 27 plies, from the tests)

| Move | Distance after | Best distance | Waste | Grade |
|---|---|---|---|---|
| Rh5+ | 26 | 26 | 0 | Best |
| Rh2 | 28 | 26 | 2 | Good (no progress this move) |
| Rg1 | 30 | 26 | 4 | Inaccuracy |
| Ra1 | 34 | 26 | 8 | Mistake |
| Rh8?? | draw | — | — | Blunder |

## 3. The computer opponent

* **Losing side:** always the longest resistance (maximum DTM), random among
  equally good moves, so you learn to beat the toughest defence.
* **Defending drills (you hold the draw):** the computer only plays moves that
  keep its draw, weighted toward pawn pushes, checks and king moves toward your
  king, so the pressure is real.
* It replies after about 0.4 s. Your clock pauses while it "thinks".

## 4. Points

| Part | Amount |
|---|---|
| Solve | drill base × (1 + 0.25 × (level − 1)) |
| Efficiency bonus | up to +50% of base × efficiency² |
| Speed bonus | up to +50% of base: full at ≤ half of par, half at par, zero at 1.5 × par |
| Perfect play | +25% (no wasted moves, hints or takebacks) |
| Only moves (defending) | +5% each, max +25% |
| Hint | −20% each (first press shows the piece, second the square) |
| Takeback | −25% each |
| New personal-best pace | +10% (after 3 solves of that drill) |
| Floor | a solve is always worth at least 20% of base. A failure is worth 0. |

**Base points by difficulty:** Ladder 8 · Queen mate 10 · Rook mate 15 ·
Escort the pawn 18 · Opposition defence 18 · Queen vs pawn 28 · Philidor 30 ·
Two bishops 30 · Lucena 32 · Queen vs rook 45 · Bishop + knight 50.

**Par time** = `5 s + seconds-per-move × moves to the goal × drill difficulty`.
Seconds-per-move drops with level (e.g. rook mate: 4.5 → 2.5 s).

## 5. Progression

* **Five levels per drill.** Levels 1–3 use progressively longer or harder
  positions, split into thirds of the puzzle bank by distance to mate (or, for
  defending drills, by how few saving moves exist). Levels 4–5 are **speed
  levels**: the same hard positions against a tighter par.
* **Level up** after 3 qualifying solves at your current level: ≥ 70% efficiency
  and no takebacks, plus beating par at levels 4–5.
* **Mastery stars** (0–5) follow the level; 5 stars means "Mastered".
* **Ranks** by total points: Sprout → Seedling (250) → Clove (750) → Bulb
  (2,000) → Braid (5,000) → Garlic Knight (10,000) → Garlic Grandmaster (20,000).

## 6. The daily garlic bulb

* Each solved drill fills one clove (centre first, then outward) with a rising
  liquid fill and a little pop.
* The 5th clove completes the bulb: it bounces, glows gold, sprouts and
  sparkles, and you earn **+50 points**.
* Completing the bulb on consecutive days builds a 🔥 streak (badges at 3, 7
  and 30 days).
* The day resets at **your local midnight**.

## 7. Variety from a fixed bank

`shared/puzzles.json` holds 60 positions per drill (660 in total), each one
verified against the tablebase, non-trivial (at least one move throws the result
away), and de-duplicated under symmetry. At play time every position is randomly
rotated or reflected (8 ways without pawns, 2 with) and colour-swapped, so you
also practise as Black.
Regenerate it with `npm run puzzles`.
