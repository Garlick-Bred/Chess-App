# What's missing, and questions for you

## Things you didn't ask for but will probably want

Roughly in order of value for you specifically:

1. **A "beat the clock" mode.** Your biggest endgame leak is time, not
   knowledge: 227 endgames were lost on time, 57 of them with a winning position
   on the board (see the [analysis report](reports/ham_sandmitch-endgames.md)).
   Levels 4–5 already train speed against par, but a real game clock (for
   example 30 s + 1 s per move to mate with K+Q) would copy the blitz pressure
   where you actually lose.
2. **Spaced repetition of your misses.** Store every position you failed or
   needed a takeback on, and serve that exact position again after 1, 3 and
   7 days. Cheap to add: the attempts table already stores the start FEN.
3. **Positions from your own games.** The analysis found the exact moves where
   you threw away tablebase wins or draws (with 7 or fewer pieces). Turning those
   into a personal "my mistakes" deck is the most targeted practice possible.
4. **The endgames you actually reach most.** Your most common endgames (rook +
   minor piece, queen + others) have too many pieces for a tablebase. Drilling
   them needs Stockfish (in the browser via WebAssembly) and a "play it out from
   this position" mode. Pure rook endings and pawn endings beyond K+P vs K are
   the next drill families to add: outside passed pawn, square rule and pawn
   races, triangulation, Vancura, rook behind the passed pawn.
5. **Password resets.** There is no email, so a forgotten password currently
   needs a database edit. A simple "family admin can reset passwords" switch is
   worth adding before sharing.
6. **Hosting and backups.** The app is one Node process plus one SQLite file.
   It needs a host with a persistent disk, and the database should be backed up.
7. **Adaptive par times.** Par is a formula today. Once the family has played a
   few hundred drills, par could come from your own median times.
8. **Install as an app (PWA)** so it sits on phones' home screens, with
   haptics on move and clove fill.
9. **Grounded explanations.** If you later want an AI coach, have it explain
   the tablebase's verdict (e.g. "Kd3 takes the opposition") and check every
   claim against the tablebase. Never let it judge moves on its own.
10. **Accessibility:** keyboard move entry, and screen-reader announcements of
    moves and grades.

## Decisions I made that you might want to change

| Decision | What I chose | Alternatives |
|---|---|---|
| What fills a clove | Any solve, including easy drills, hints and takebacks | Require a solve at your current level, or 5 different drills, so it can't be farmed with Ladder Mate |
| Bulb size | 5 cloves, +50 points | Different size or bonus |
| Hints / takebacks | Allowed with −20% / −25% | Disallow at speed levels |
| Clock | Counts only your thinking time | Wall-clock time |
| Locking | Every drill open from the start; levels unlock per drill | Lock tiers behind earlier ones |
| Family competition | Raw points | Handicap by rating so beginners can compete with you |
| Accounts | Username + password, optional family invite code | Profile picker with PINs on one shared device |
| Colour | Random White/Black per puzzle (changeable in Settings) | Always White |

## Questions that would improve the next version

1. **Who is in the family?** Ages and rough ratings change the defaults: a
   kid mode with gentler penalties, bigger hints and fewer stats, for example.
2. **Where should it run?** Options in the README. Do you want a domain name?
3. **Should family members' chess.com accounts be analysed too?** The analysis
   currently runs as scripts. Doing it inside the app means fetching from
   chess.com on the server and running Stockfish there (or in the browser).
4. **How competitive should the leaderboard be?** Weekly reset only, or also
   all-time? Handicaps?
5. **Your goal and time frame.** For example "+150 blitz in 3 months" would
   let the app pace the daily bulb (5 drills a day, or more on weekends).
6. **Board look.** It uses a green board and the classic "cburnett" pieces.
   Would you like alternative themes, piece sets or sounds?
