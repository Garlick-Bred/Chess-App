# What's missing, and open questions

## Done since the first version

* The site is live at https://endgames.garlick.ca (a Workers custom domain:
  free, with an automatic certificate).
* Family accounts on a public Cloudflare site with an invite code, adult
  profiles with chess rating, and rating-based starting levels.
* Harder cloves: drills below your level only fill part of one.
* "Garlick" naming and the cartoon bulb.

## Still worth building

Roughly in order of value for you:

1. **A "beat the clock" mode.** Your biggest endgame leak is time, not
   knowledge: 227 endgames were lost on time, 57 of them with a winning position
   on the board (see the [report](reports/ham_sandmitch-endgames.md)). A real
   game clock per drill (for example 30 s + 1 s per move for K+Q) would copy the
   blitz pressure where you actually lose.
2. **Spaced repetition of your misses.** Store every position you failed or
   needed a takeback on, and serve that exact position again after 1, 3 and
   7 days. The attempts table already stores the start position.
3. **Positions from your own games.** The analysis found the exact moves where
   you threw away tablebase wins or draws. Turn them into a personal deck.
4. **The endgames you actually reach most** (rook + minor piece, queen +
   others) are too big for a tablebase. They need Stockfish (WebAssembly, in
   the browser) and a "play it out" mode. The next drill families to add are
   pawn races and the square rule, triangulation, outside passed pawns, Vancura,
   and a rook behind a passed pawn.
5. **Password resets.** There is no email, so an admin (you) needs a "reset
   password" button for family members.
6. **Rating sync from chess.com.** If each person enters their chess.com
   username, the site can refresh their rating automatically.
7. **Adaptive par times** from the family's own median times once there is
   enough data.
8. **Install as an app (PWA)** with haptics on phones.
9. **Grounded explanations:** an AI coach that explains the tablebase's verdict
   and is checked against it, never judging moves itself.

## Decisions I made that you might want to change

| Decision | Current choice | Alternatives |
|---|---|---|
| Clove values | Your level 1 · easy ½ · warm-up ¼; level 3 ×1.5, levels 4-5 ×2 (max 1); hint or takeback halves it | Stricter (warm-ups worth 0), or a daily cap on warm-up cloves |
| "Your level" bands | Less than 200 below your rating = core; 200-499 below = easy; 500+ below = warm-up | Different bands, or per-drill tuning after the family has played |
| Rating sources | Every source (chess.com rapid/blitz, FIDE, CFC, Lichess, guess) is taken at face value | Convert to one scale (chess.com and Lichess run higher than FIDE/CFC at club level) |
| Bulb | 5 cloves, +50 points, resets at local midnight | Different size or bonus |
| Leaderboard | Raw points, weekly and all-time; ratings visible to the family | Handicap by rating so everyone can compete |
| Sign-ups | Anyone with the invite code can create an account | Turn sign-ups off once the family has joined |
| Passwords | At least 8 characters, no email recovery | Admin reset, or email-based reset |

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
