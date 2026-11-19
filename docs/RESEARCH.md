# Research notes

What the research says about the questions you asked, and how it shaped the
app. The searches ran in November 2026. Where I could only see search excerpts
rather than the full paper, I say so.

## 1. What to learn at your rating

Your chess.com ratings when the analysis ran: **blitz 1122, rapid 1322,
daily 1103** (tactics peak 1844, which suggests your calculation is ahead of
your endgame technique).

*Silman's Complete Endgame Course* is the standard curriculum and is organised
by rating band:

| Band | What Silman puts there | In this app |
|---|---|---|
| Under 1000 | Beginners' section (contents not checked; standard practice is the basic mates) | Tier 1: Ladder, Queen mate, Rook mate |
| Class E, 1000–1199 | Opposition, rook pawns ✔ | Tier 2: Escort the pawn, Opposition defence |
| Class D, 1200–1399 | "Beyond basic opposition" (the magic rectangle), K+P vs lone king in depth ✔ | Tier 2 at higher levels; Queen vs pawn |
| Class C, 1400–1599 | Pawn endings, minor pieces, **Lucena and Philidor** ✔ (per a reviewer) | Tier 3: Lucena, Philidor, Two bishops |
| Higher bands | Not checked | Tier 4 stretch goals: Queen vs rook, Bishop + knight |

✔ = confirmed from the Library of Congress table of contents or published
reviews. The rest is my placement, not Silman's.

So your core material is Tiers 1–2, with the Tier 3 rook endings as the next step.
Bishop + knight is famously rare in real games; it's included because you asked
for it as the "very hard" benchmark, not because it will win you many games.

Rook endings are the most common endgame type in master databases: rook vs rook
appears in about **8.45%** of all games, according to Müller & Lamprecht's
*Fundamental Chess Endings*. I saw that figure only second-hand. Your own games
agree: rooks are on the board in most of your endgames (see the analysis
report).

## 2. What kind of practice works

* **Deliberate practice beats just playing.** A 2026 *Psychological Science*
  study of **44,213 chess.com players** found that practice activities aligned
  with deliberate practice were associated with a **3.61× learning-efficiency
  advantage** over playing games, even though players spent over 90% of their
  time playing. It is observational (association, not proof), and not every
  practice activity was equally effective.
* **Study the endgames that occur in your own games**, plus the ones expected at
  your rating. That is why the app has a chess.com analysis and per-account
  recommendations.
* **Understand, don't just memorise.** Every drill has a written plan ("How to
  win this"), and the grading rewards plan-based technique rather than DTM
  perfection (see [DESIGN.md](DESIGN.md)).
* **Spaced repetition:** I found no peer-reviewed study of spaced repetition
  specifically for chess. It is well established in other learning research,
  so "re-serve positions you failed after 1, 3 and 7 days" is on the roadmap
  rather than presented as proven for chess.

## 3. Do you need a chess engine? Can an LLM teach chess?

You were right to be sceptical of LLMs.

* **LLMs make illegal moves and lose track of the board**, more so as games get
  complex (SPIN-Bench; the LLM CHESS benchmark; ChessArena). Giving a model the
  list of legal moves helps a lot but does not fix it.
* **LLM chess commentary hallucinates.** A 2026 paper (*Hallucinations on the
  Board*, ACT-Eval) breaks commentary into atomic claims and checks them with an
  engine. It reports that a frontier model without tools got **22%** of
  sub-claims wrong, and smaller open models more than 40%. It also found a
  naive LLM judge rated flawed commentary highly. I saw these figures in search
  excerpts only.
* The pattern that works, in research and in practice, is **"engine supplies the
  facts, language model supplies the words, then verify"** (e.g. concept-guided
  commentary, 2024).

**For endgames there is something better than an engine: a tablebase.** With
7 or fewer pieces, Syzygy/Gaviota tablebases are solved databases giving the
exact result and distance for every move. That is what this app uses. Stockfish
was used only to analyse your full games, where positions have more than
7 pieces.

Two practical caveats:

* Syzygy tables are built around the 50-move rule (DTZ), not the fastest mate,
  so a "best" Syzygy move is not always the shortest mate. The app uses DTM
  (Gaviota) wherever it exists, which covers every drill.
* Chess Tempo's endgame trainer scores against shortest DTM but allows a
  conversion sequence that costs up to 3 extra moves. The app's "conversion
  allowance" follows the same idea.

## Sources

* Silman's course structure: [Library of Congress table of contents](https://catdir.loc.gov/catdir/toc/ecip076/2006037884.html), [New in Chess](https://www.newinchess.com/silman-s-complete-endgame-course), [review (Scholastic Chess)](https://scholasticchess.blogspot.com/2008/07/review-silmans-complete-endgame-course.html), [Chess4Life review](https://blog.chesshouse.com/?p=79)
* Endgame frequencies: [ChessBase – rook endings (Karsten Müller)](https://en.chessbase.com/post/endgame-blog-karsten-mueller-2020_45e), [Chess.com forum: endgame percentages](https://www.chess.com/blog/NimzoRoy/endgame-percentages), [Wikipedia – rook and pawn vs rook](https://www.wikipedia.com/wiki/Rook_and_pawn_versus_rook)
* Practice: [Psychological Science (2026), "Not All Practice Is Created Equal"](https://www.psychologicalscience.org/journals/psychological-science/09567976261452568/), [Campitelli & Gobet review](https://www.psychologicalscience.org/journals/current-directions/0963721411421922/), [Chess.com study guide 1000–1400](https://www.chess.com/article/view/wgm-dina-belenkayas-beginner-intermediate-study-guide-1000-1400-elo), [What you should know: endgames 1000–1399](https://www.chess.com/blog/CraiggoryC/what-you-should-know-endgames-ratings-1000-1399)
* LLMs and chess: [SPIN-Bench](https://arxiv.org/pdf/2503.12349), [LLM CHESS](https://arxiv.org/pdf/2512.01992), [ChessArena](https://arxiv.org/pdf/2509.24239), [Hallucinations on the Board (ACT-Eval)](https://arxiv.org/pdf/2608.04240), [Concept-guided chess commentary](https://arxiv.org/abs/2410.20811), [Lichess blog: can LLMs understand chess?](https://lichess.org/@/RuyLopez1000/blog/can-llms-like-chatgpt-understand-chess/zUyffwCx)
* Tablebases: [Lichess – 7-piece Syzygy](https://lichess.org/blog/W3WeMyQAACQAdfAL/7-piece-syzygy-tablebases-are-complete), [Chess Tempo endgame rating guide](https://fr.chesstempo.com/user-guide/en/endgameRatingSystem.html), [Lichess forum – DTZ vs fastest mate](https://lichess.org/forum/general-chess-discussion/endgame-table-base-prioritizing-50-move-rule-reset-over-quickest-checkmate-variation), [Chess Programming Wiki – Endgame tablebases](https://www.chessprogramming.org:443/Endgame_Tablebases)
