# What's missing, and open questions

## Done since the first version

* The site is live at https://endgames.garlick.ca (a Workers custom domain:
  free, with an automatic certificate).
* Family accounts on a public Cloudflare site (open sign-up), adult
  profiles with chess rating, and rating-based starting levels.
* Harder cloves: drills below your level only fill part of one.
* "Garlick" naming and the cartoon bulb.
* Faster computer replies (prefetching, edge cache, direct Lichess fallback)
  and premoves.
* Written hints and piece hints, built from rules on the tablebase (no AI).
* Lessons for every drill, offered after a failed puzzle, with a one-clove
  replay.
* "Keep going or done for today?" when the bulb fills, with a wrap-up page.
* Phone layout: a bottom tab bar (all six sections fit), nothing scrolls
  sideways down to 320 px wide, and open tabs reload themselves after a deploy.
* Endgame School (curriculum with graduation and spaced check-ups), an
  endgame rating, and full cloves for drills at your level.

## Still worth building

Roughly in order of value for you:

1. **A "beat the clock" mode.** Your biggest endgame leak is time, not
   knowledge: 227 endgames were lost on time, 57 of them with a winning position
   on the board (see the [report](reports/ham_sandmitch-endgames.md)). A real
   game clock per drill (for example 30 s + 1 s per move for K+Q) would copy the
   blitz pressure where you actually lose.
2. **Spaced repetition of exact positions.** Endgame School already spaces
   check-ups per drill; the next step is to re-serve the exact positions you
   failed after 1, 3 and 7 days (the attempts table stores them).
3. **Positions from your own games.** The analysis found the exact moves where
   you threw away tablebase wins or draws. Turn them into a personal deck.
4. **The endgames you actually reach most** (rook + minor piece, queen +
   others) are too big for a tablebase. They need Stockfish (WebAssembly, in
   the browser) and a "play it out" mode. The next drill families to add are
   rook vs pawn and the square rule (both in Silman's 1400-1599 section),
   pawn races, triangulation, outside passed pawns, Vancura, and a rook behind
   a passed pawn.
5. **Password resets.** There is no email, so an admin (you) needs a "reset
   password" button for family members.
6. **Rating sync from chess.com.** If each person enters their chess.com
   username, the site can refresh their rating automatically.
7. **Adaptive par times** from the family's own median times once there is
   enough data.
8. **Install as an app (PWA)** with haptics on phones.
9. **Richer explanations:** the rule-based hints cover boxes, opposition,
   bridges and checks. An AI coach could add longer explanations, as long as
   it is checked against the tablebase and never judges moves itself.

## Decisions I made that you might want to change

| Decision | Current choice | Alternatives |
|---|---|---|
| Drill ratings | Baseline from research (Nov 2026): basic mates 400-800, K+P 1000, Lucena/Philidor/two bishops 1400, Q vs P 1450, Q vs R and B+N 2000 | Tune per drill once the family's results show where they really sit |
| Clove values | Your level 1 · easy ½ · warm-up ¼; level 3 ×1.5, levels 4-5 ×2 (max 1); hint or takeback halves it | Stricter (warm-ups worth 0), or a daily cap on warm-up cloves |
| "Your level" bands | Less than 200 below your rating = core; 200-499 below = easy; 500+ below = warm-up | Different bands, or per-drill tuning after the family has played |
| Rating sources | Every source (chess.com rapid/blitz, FIDE, CFC, Lichess, guess) is taken at face value | Convert to one scale (chess.com and Lichess run higher than FIDE/CFC at club level) |
| Bulb | 5 cloves, +50 points, resets at local midnight | Different size or bonus |
| Leaderboard | Raw points, weekly and all-time; ratings visible to the family | Handicap by rating so everyone can compete |
| Sign-ups | Open: anyone who finds the site can create an account (the invite code was removed on request) | Set an `INVITE_CODE` secret again, or close sign-ups once the family has joined |
| Passwords | At least 8 characters, no email recovery | Admin reset, or email-based reset |
| Hint costs | Written hint −10% points (clove kept); piece hint −20% points and half the clove | Free written hints, or a limit per puzzle |
| Lesson replay | A full clove for solving the puzzle after its lesson, at most 2 a day, half points, no level-up credit | 1 a day, or only for drills at your level |

## Open questions

1. **Will the GitHub repo stay public?** Deploys without a token rely on
   Cloudflare fetching the bundle from the public repo. If you make it private,
   deploys need either a valid Cloudflare API token in the environment's
   Network secrets, or the repo connected to Cloudflare Workers Builds (push to
   deploy). The token saved earlier was rejected by Cloudflare as invalid, so
   you may want to delete it from the environment's settings.
2. **Who's in the family, roughly how strong is each person, and how much time
   do they have?** That tunes the clove bands, the default rating, and whether
   five cloves a day is the right target.
3. **Should ratings be put on one scale** (see the table above)?
4. **Should the leaderboard be handicapped** so the strongest player doesn't
   always win the week?
5. **Should I add an admin role** for you: reset passwords, remove accounts,
   close sign-ups?
6. **Rating goal and time frame** (for example "+150 blitz by spring"), so the
   app can suggest a weekly plan.
