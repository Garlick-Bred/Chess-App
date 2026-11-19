# Endgame report: ham_sandmitch (chess.com)

**Data:** all 1,809 games from April 2016 to November 2026: 1,422 blitz, 145
daily, 137 bullet and 105 rapid. Ratings when analysed: blitz 1122, rapid
1322, daily 1103. "Recent" means the last 24 months (from November 2024).
**Method:** every game replayed with python-chess; every endgame position
evaluated with Stockfish 16 (40,392 positions); every move you made with 7 or
fewer pieces checked against the Lichess tablebase. Details are in
[analysis/README.md](../../analysis/README.md).

## Headlines

1. **The clock is your biggest endgame leak.** 227 endgames were lost on time:
   **57 of them with a winning position on the board** when the flag fell, and
   115 after you had been clearly winning at some point. When you entered an
   endgame with less than 20% of your time left (251 games) you scored
   **32.7%**, against **52.0%** otherwise. Your median pace in blitz endgames
   is **3.9 seconds per move**.
2. **Pawn endings are where you lose the most per game.** You scored **52.6%**
   in them, where Stockfish's evaluation at the moment you reached them
   predicted **63.0%**. That is the largest gap per game of any endgame type.
   You converted only **60%** of winning pawn endings.
3. **You stalemate people.** 12 games ended in stalemate; **10 times it was
   you stalemating an opponent while you were ahead in material**, 4 of them
   with a queen against a bare king. Two were your opponents saving
   themselves against you.
4. **Endgames happen a lot, and they cost you overall.** 66% of your games
   (1,191) reach an endgame. Across them you scored 48.1% where the engine
   expected 53.0%, about **59 points thrown away**, roughly one full point
   every 20 endgames. The last two years look the same (48.4% vs 53.4%), so
   this hasn't fixed itself with experience.
5. **Rooks are almost always involved.** 98.5% of your endgames start with at
   least one rook on the board. 157 games reached a pure rook ending, where you
   converted 65% of the winning ones.

## Overall

| | All time | Last 24 months |
|---|---|---|
| Endgames | 1,191 | 616 |
| Score / engine-expected | 48.1% / 53.0% | 48.4% / 53.4% |
| Winning at endgame start (≥ +2.00) | 471 → **won 71%** (135 not won) | 242 → won 70% |
| Losing at endgame start (≤ −2.00) | 362 → saved 18% | 183 → saved 19% |
| Roughly level at endgame start | 192 → scored 41% | 99 → scored 40% |
| Engine blunders per 100 endgame moves | 5.8 | 5.6 |

The weakest line is **level endgames: you score 41%** from equal positions.
Good technique turns those into wins, and you are currently on the wrong side
of them.

## By endgame type

A game counts under every type it passed through for at least two moves each,
so rows overlap. "Expected" is the engine's evaluation at the moment you
reached that type.

| Type | Games | Score | Expected | Points vs expected | Converted when winning | Saved when losing |
|---|---|---|---|---|---|---|
| Queen + other pieces | 632 | 46.0% | 51.0% | −32.1 | 73% of 244 | 15% of 221 |
| Rook + minor piece | 566 | 50.4% | 56.2% | −33.3 | 68% of 235 | 22% of 134 |
| Pieces vs pawns | 360 | 55.0% | 60.4% | −19.4 | 78% of 214 | 10% of 131 |
| Rook vs minor piece | 160 | 52.2% | 55.8% | −5.8 | 81% of 88 | 8% of 61 |
| **Pure rook** | **157** | 49.0% | 52.2% | −5.0 | **65% of 49** | 33% of 40 |
| **Pure pawn** | **98** | 52.6% | **63.0%** | **−10.3** | **60% of 53** | 29% of 24 |
| Minor pieces only | 71 | 54.9% | 56.2% | −0.9 | 69% of 29 | 57% of 14 |
| Queen only | 36 | 54.2% | 58.6% | −1.6 | 47% of 15 | 80% of 5 |

The most common exact material when an endgame begins:
R+R+B vs R+R+N (77 games), Q+R+R vs Q+R+R (72), Q+R+B vs Q+R+B (59) and
R+R+B vs R+R+B (55).

By material at the start of the endgame (score, with draws as half): a **piece
up you score 73%** (a piece up should be close to 100%), **a pawn up 52%**,
level material 45%, a pawn down 42%.

## Exact tablebase audit (7 or fewer pieces)

This section uses no engine estimates. Every move you made with 7 or fewer
pieces on the board (2,764 positions in 226 games) was checked against the
tablebase. A **result-changing move** turned a win into a draw or loss, or a
draw into a loss.

| Type when it got down to 7 pieces | Games | Tablebase wins → you won | Tablebase draws → you held | Result-changing moves |
|---|---|---|---|---|
| Rook + pawns | 63 | 38 → **23 (61%)** | 12 → 7 | 22 |
| Mixed pieces | 58 | 37 → 26 (70%) | 2 → 1 | 21 |
| Minor pieces + pawns | 47 | 25 → 17 (68%) | 10 → 5 | 15 |
| **King + pawns** | **35** | 21 → **11 (52%)** | 4 → 2 | **21** |
| Queen vs pawns / lone king | 18 | 13 → 11 (85%) | 2 → 1 | 0 |
| Queen endings | 5 | 3 → 0 | 2 → 1 | 3 |
| **All** | **226** | **137 → 88 (64%)** | **32 → 17 (53%)** | **82** |

What this says:

* **One in three theoretically won simple endgames does not become a win.**
  With perfect knowledge available, 49 wins slipped away.
* **Pawn endings are the worst**: 21 result-changing moves in 35 games, and
  only 11 of 21 won positions converted. Of the other 10, 4 were lost on time;
  the rest went wrong over the board.
* **Queen vs pawns or a lone king: no technical errors at all.** The two you
  didn't win were both lost **on time**. That's the clock again.
* The most common small endings you reach are K+2P vs K+3P and K+3P vs K+2P
  (14 each) and K+R+2P vs K+R+P (13).

Some examples of result-changing moves (open the games on chess.com to
replay them):

| Game | Ending | Move | Effect |
|---|---|---|---|
| [rapid](https://www.chess.com/game/live/116890774123) | K+3P vs K+2P | g4, later Kg4 | win → draw → loss (resigned) |
| [rapid](https://www.chess.com/game/live/30415186987) | K+3P vs K+2P | Kf3, then Kf2 | win → draw → loss (on time) |
| [blitz](https://www.chess.com/game/live/109093865892) | K+R+2P vs K+R+P | f4, later Kf7 | win → draw → loss (resigned) |
| [blitz](https://www.chess.com/game/live/6411182436) | K+R+N+P vs K+R+P | f4, Ra4, Kg5 | win → draw → loss (mated) |
| [daily](https://www.chess.com/game/daily/360096787) | K+R+2P vs K+R+P | c5, Rb7 | win → draw (agreed) |
| [blitz](https://www.chess.com/game/live/109092057818) | K+B+2P vs K+2P | Bc1, Bxb2 | win → draw |

## The clock

| | |
|---|---|
| Median share of your clock left when an endgame starts | 40% |
| Endgames started with under 20% of your time | 251, scoring 32.7% (vs 52.0%) |
| Endgames lost on time | 227 |
| …with a winning position on the board | **57** |
| …after being clearly winning (≥ +3.00) at some point | 115 |
| Draws because you flagged but the opponent couldn't mate | 17 |

## Draw traps

| | |
|---|---|
| You stalemated the opponent while ahead in material | **10** (K+Q+B vs K twice, K+Q vs K, K+Q+R+3N vs K, K+R+R+3P vs K and others) |
| You were stalemated while behind (saved by the opponent) | 2 |
| Repetition draws from a position that had been +3.00 or better | 8 |

## What to drill (and what the app now recommends you)

1. **Opposition Defence → Escort the Pawn.** Pawn endings are the biggest gap
   per game and the cheapest to fix: key squares and the opposition decide
   nearly all of them.
2. **Queen Mate, aiming for the speed levels.** It fixes the stalemate habit
   (the drill flags stalemates as blunders and says why) and builds speed. Target
   about 2 seconds per move against your current 3.9.
3. **Lucena and Philidor.** You reach pure rook endings in about 1 in 8
   endgames and convert only two-thirds of the winning ones.
4. **Rook Mate and Queen vs Pawn** for speed and conversion.
5. **Not covered yet:** your most common endgames (queen or rook plus minor
   pieces) are too big for a tablebase. See [ROADMAP.md](../ROADMAP.md)
   (Stockfish "play it out" mode).

## Caveats

* Stockfish ran at 60,000 nodes per position. That's fast and good enough for
  trends, not a deep evaluation of every position.
* "Expected score" uses Lichess's winning-chances curve, which ignores draws and
  was fitted on stronger players. The direction of the gaps is reliable; the
  exact points are approximate.
* The data covers 10 years and includes bullet (92 endgames). The recent column
  shows the same picture.
