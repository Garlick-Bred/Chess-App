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
* It replies as soon as the tablebase answers, with a 0.22 s minimum so the
  move is visible. Your clock pauses while it "thinks".
* **Keeping it fast:** while you think, the app looks up the positions after
  your likeliest moves (the top three perfect moves, and every move of a piece
  you pick up), so most replies are already cached. Lookups go to our server
  first; if it hasn't answered in 0.6 s the browser also asks Lichess directly
  and takes whichever is first. The server caches answers at the Cloudflare
  edge and in D1, writes the cache after replying, and gives up on Lichess
  rate limits immediately instead of waiting.
* **Premoves:** while the computer is moving you can queue your next move (tap
  or drag as usual, shown in blue). It's played the moment the computer moves,
  if it's still legal; otherwise it's dropped. Tap anywhere else to cancel.

## 4. Points

| Part | Amount |
|---|---|
| Solve | drill base × (1 + 0.25 × (level − 1)) |
| Efficiency bonus | up to +50% of base × efficiency² |
| Speed bonus | up to +50% of base: full at ≤ half of par, half at par, zero at 1.5 × par |
| Perfect play | +25% (no wasted moves, hints of either kind, or takebacks) |
| Only moves (defending) | +5% each, max +25% |
| Written hint | −10% each: describes the idea ("cut the king off") without naming the move |
| Piece hint | −20% each: highlights which piece to move, not where |
| Takeback | −25% each |
| New personal-best pace | +10% (after 3 solves of that drill) |
| Challenge | up to +50% of base for a puzzle rated above your endgame rating (full at 400+ above) |
| Solve streak | from the 3rd solve in a row without a failure, +10% of base per solve, max +50% |
| Golden clove | half of base (min 10), about 1 solve in 8 at your level |
| Full bulb | +50, plus 10 per day of the streak you bring into today (max +150) |
| Floor | a solve is always worth at least 20% of base. A failure is worth 0. |
| Replay after a lesson | the total is halved, and there is no perfect bonus |

**Base points by difficulty:** Ladder 8 · Queen mate 10 · Rook mate 15 ·
Escort the pawn 18 · Opposition defence 18 · Queen vs pawn 28 · Philidor 30 ·
Two bishops 30 · Lucena 32 · Queen vs rook 45 · Bishop + knight 50.
(Points use these fixed bases; the endgame rating uses each drill's target
rating.)

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
* **The Garlick Path** (`shared/path.js`) replaces ranks. Points move you
  along a map of stages: 100 points to reach 1-2, then each stage costs 40
  more than the last (140, 180, ...; capped at 1,500). Five stages make a
  world, each with its own theme: 🌱 Garlic Patch, 🏘️ Pawn Village,
  🏰 Rook Towers, ⛪ Bishop's Cathedral, 🌲 Knight's Forest, 👑 Queen's Palace,
  🏔️ Grandmaster Summit, then endless 🌟 Legend worlds. World 2 starts at 900
  points, World 7 ends at about 27,000 (roughly 3-4 months of daily bulbs).
  The Path page is an isometric board per world (each with its own
  colours and a landmark: a garlic bulb, a village, a castle, a cathedral,
  a forest, a crown, a summit), raised tiles for the stages climbing upward
  (green with a tick when done, frosted with the stage number ahead), your
  pawn and avatar on the current tile, and a bottom panel with points,
  streak, progress and "Start School". The result screen shows the bar
  moving and celebrates new stages and worlds; the header shows your stage. The path is separate from the endgame
  rating: points reward effort and consistency, the rating measures skill.

## 6. The daily Garlick bulb

* The bulb is drawn cartoon-style: a bold dark outline, a tall neck, green
  stalks and a ground shadow. Empty cloves are dim taupe.
* Solves colour in cloves (centre first, then outward) with a rising liquid
  fill. How much of a clove a solve is worth depends on **your rating**
  (`shared/cloves.js`):

  | Drill vs your rating | Example at 1300 | Clove value (levels 1-2) |
  |---|---|---|
  | Your level: less than 200 below you | Lucena, Philidor, Q vs P, two bishops | **1 clove** |
  | Easy: 200-499 below you | Escort the pawn, opposition | **½ clove** |
  | Warm-up: 500+ below you | Ladder, queen and rook mates | **¼ clove** |

  Level 3 is worth 1.5x and the speed levels (4-5) 2x, capped at one clove, so
  getting fast at an easy mate still pays. A piece hint or takeback halves the
  value. A written hint costs points but not clove value.
  At 1300, a full bulb takes about five drills at your level, or about thirteen
  two-rook mates at level 3.
* **Your level means your results, too:** a drill in your Endgame School
  rotation (or a due check-up) always fills a whole clove, even if the
  rating gap says "easy", and the ratings used are your endgame rating. A
  stretch drill (350+ above you) also fills a whole clove. When a solve fills
  less, the result screen says why (easy for your rating, takeback used...).
* **Lesson replays:** solving a puzzle again right after its lesson earns a
  **full clove** whatever the drill, at most twice a day. Replays don't count
  toward level-ups or personal bests.
* New players are placed by rating: warm-up drills start at level 3 and easy
  ones at level 2. Changing your rating re-places drills you haven't played yet.
* The 5th clove completes the bulb: the stalks shoot up and wiggle, the bulb
  bounces, glows gold and sparkles, and you earn **+50 points**.
* The solve that completes the bulb then asks **"Keep going, or call it a
  day?"** (Enter doesn't skip the question). *Done for today* opens a wrap-up:
  puzzles solved, points, perfect solves, the drills you played, your streak and
  the time until a fresh bulb. Home then shows "Done for today ✓" for the rest
  of the day, with a small "Play anyway" link. The choice is remembered in that
  browser only; extra solves after it still earn points.
* Completing the bulb on consecutive days builds a 🔥 streak (badges at 3, 7
  and 30 days).
* **Garlic braid and streak shields** (`shared/streak.js`): once the bulb is
  full, every further clove weaves into a braid; 5 extra cloves make a 🛡️
  streak shield (hold up to 2). A shield is used automatically on your next
  visit for a day you missed (only if you have enough to cover every missed
  day; otherwise you keep them). A shielded day keeps the streak unbroken but
  doesn't add to it. Cloves already earned beyond a full bulb before this
  feature were credited to the braid.
* **Repair:** missed yesterday with no shield? Fill a double bulb (10 cloves)
  today and the streak carries on. Research (Silverman & Barasch 2023) found
  that broken streaks make people back away from a habit and that a way to
  repair them softens this; Duolingo's freezes and wagers lifted retention.
* **Golden cloves:** about 1 in 8 solves at your level (in your School
  rotation, core or stretch, no "Show piece", not a lesson replay) turns
  golden for bonus points of half the drill's base (at least 10), with a
  sparkle and chime. At most 15 such solves go by without one. They are a
  small variable reward on top of the predictable ones and never touch your
  rating, levels or School progress.
* The day resets at **your local midnight**.

## 7. Hints and lessons (no LLM)

Hints and lessons come from rules on top of the tablebase, so they are never
wrong about the position. `shared/hints.js` measures the defending king's
**box** (the squares it can reach without walking into an attack; an
undefended piece doesn't count as a wall) and tags each move with what it does:
mate, promote, capture, build the bridge, cut off, check that drives back,
take the opposition, step back, third-rank defence, check from behind, king
approach, waiting move. Among the equally perfect moves it picks the easiest
to explain.

* **💬 Hint** gives the idea in words, plus a stalemate warning if one of
  your moves would stalemate, and "only N moves keep the win" when that's so.
* **🎯 Show piece** circles the piece to move.
* **📖 Lessons** (the Learn tab, or "Show me how" after a failed puzzle) start
  from the same position and step through perfect play move by move, with an
  arrow for the next move, the king's box shaded, and one sentence per move.
  The defender plays the longest resistance. "↩ Back to the puzzle" above the
  board leaves the lesson at any point; at the end, "Play it yourself" does
  the same. Either way the replay is worth a clove, and the replay has a
  "Watch the lesson again" link.

## 8. Endgame School

The main way to train (`shared/curriculum.js`). It serves endgames at your
level and moves you on once you've shown you know them.

* **Now learning:** 3 drills at a time, rotated so you cycle between endgames
  of similar difficulty (never the same one twice in a row). Drills you're
  struggling with (under 60% solved over 2+ tries) come first, even if they
  are "easy" for your rating; then the drills closest to your endgame rating.
  Stretch drills (350+ above you, e.g. bishop + knight at 1200) wait until
  the ones below them are learned.
* **Graduating:** 10 solves in a row without a failure graduate a drill: it
  leaves the rotation and the next one moves in. Takebacks, written hints and
  slow play are fine; a solve that needed "Show piece" doesn't count but
  doesn't reset the run; a failed puzzle resets it. Any attempt at the drill
  counts, not just School ones.
* **Check-ups:** a graduated drill comes back after 3, 7, 14, 30 and 60 days,
  at most 2 check-ups a day. A solve pushes the next one out; a solve that
  needed "Show piece" re-checks tomorrow; a failure sends it back to "Now
  learning".
* **Placed out:** drills 500+ below your rating are skipped unless your
  results say otherwise.
* Lesson replays don't count toward graduation.
* Existing players' streaks were rebuilt from their past attempts.

## 9. Endgame rating

An Elo-style rating on the chess rating scale (`shared/rating.js`).

* **Puzzle rating** = the drill's target rating, -100 at level 1, +100 at
  level 3, +175 / +250 at the speed levels. (Rook mate 800, Lucena 1400,
  queen vs pawn 1450, queen vs rook and bishop + knight 2000 at level 2;
  the baseline and its sources are in docs/RESEARCH.md.)
* **Result:** fail 0; clean solve 1; with a written hint 0.75; with a piece
  hint or takeback 0.5; under 50% efficiency -0.25 (min 0.25 for any solve).
* **Change** = K x (result - expected), expected = 1 / (1 + 10^((puzzle -
  you) / 400)). K is 40 for your first 15 rated attempts, 28 up to 50, then
  20. Solving a puzzle rated 400+ below you adds nothing, and a solve never
  lowers your rating (help just earns less).
* **Anchor:** it starts at your chess rating and each rated attempt closes 3%
  of the gap back toward it (never turning a gain into a loss or the other
  way round), so it settles near your real strength, a couple of hundred
  points above or below depending on your endgames.
* Lesson replays are unrated. Existing players were rated by replaying their
  history (and re-rated when these rules changed).

## 10. Variety from a fixed bank

`shared/puzzles.json` holds 60 positions per drill (660 in total), each one
verified against the tablebase, non-trivial (at least one move throws the result
away), and de-duplicated under symmetry. At play time every position is randomly
rotated or reflected (8 ways without pawns, 2 with) and colour-swapped, so you
also practise as Black.
Regenerate it with `npm run puzzles`.
