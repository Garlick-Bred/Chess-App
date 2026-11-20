# Reusing this codebase for another chess site

A guide for building a sibling site (for example an openings trainer) without
redoing the infrastructure here. Everything lives in `garlick-bred/chess-app`
on the branch **`claude/chess-endgame-puzzle-app-f9m906`** (not `main`).

## The stack in one paragraph

React 18 + Vite + TypeScript client (`client/`), a fetch-style API that runs
unchanged on Node (`node:sqlite`) and on Cloudflare Workers + D1 (`server/`,
`worker/`), shared game rules in plain ES modules used by both client and
server (`shared/`), chess.js for move logic, vitest for unit/server tests and
Playwright scripts for end-to-end checks. The client is built and embedded into
a single Worker script (`deploy/worker.js`), served at a custom domain.

## Copy as-is (generic infrastructure)

| Piece | Files | Notes |
|---|---|---|
| Storage interface | `server/store-node.js`, `worker/store-d1.js` | Same async `get/all/run/batch` on SQLite and D1 |
| Schema + migrations | `server/schema.js` | `SCHEMA`, `ADDED_COLUMNS`, one-off `DATA_MIGRATIONS` per version, a `meta` table so a cold start costs one query. Replace the tables, keep the mechanism |
| Auth | `server/auth.js` | PBKDF2-SHA256 (100k, Web Crypto), HttpOnly session cookies (Secure on https), login throttling |
| API skeleton | `server/api.js` | `createApi({ store, env })` returns `handle(request, ctx)`; keep config/auth/me routes and `json`/`httpError`/body-limit helpers, drop the game routes |
| Servers | `server/index.js` (Node: API + static client), `worker/index.js` (HTTPS redirect, API, embedded assets, `ctx.waitUntil`) | |
| Build + deploy | `scripts/deploy-cloudflare.mjs`, `scripts/dev.mjs`, `npm run bundle` | Builds the client, embeds it in one Worker bundle, copies it to `deploy/worker.js` |
| App shell | `client/src/main.tsx`, `App.tsx`, `api.ts`, `components/Header.tsx` | Hash router, auth gate, `useApp()` context, open tabs reload themselves after a deploy, desktop top nav becomes a bottom tab bar on phones |
| Account screens | `pages/Auth.tsx`, `components/RatingField.tsx`, `pages/Settings.tsx` | Sign-up with chess rating + source (chess.com, Lichess, FIDE, CFC...), remembered accounts on the login screen |
| Look and feel | `client/src/styles.css`, `assets/pieces/*.svg`, `sound.ts` | chess.com-like dark theme tokens, buttons, cards, modals, phone fixes; Web Audio sounds |
| Chessboard | `components/Board.tsx` | Drag or tap, selected-square glow, legal-move dots, last move, check, arrows, square shading, premoves, promotion picker, flip |
| Tests | `tests/server.test.js` (in-memory store, API via `new Request`), `scripts/e2e-*.cjs` | Playwright on the preinstalled Chromium; includes a phone horizontal-overflow check |

## Adapt (game systems that fit openings too)

| System | Files | For an openings site |
|---|---|---|
| Spaced-repetition curriculum | `shared/curriculum.js` | Rotate 3 lines at a time, graduate after N correct runs, check-ups at 3/7/14/30/60 days, failed check-up returns the line. Opening lines are a natural fit |
| Elo-style skill rating | `shared/rating.js` | Item rating per line/position, partial credit for help, K 40/28/20, no gain for very easy items, gently anchored to the chess rating, solves never lower it |
| Daily goal + streaks | `shared/streak.js`, `shared/cloves.js`, `components/GarlickBulb.tsx`, `GoldenClove.tsx` | Daily 5-clove bulb, streak shields from extra cloves (hold 2), repair with a double bulb, golden-clove variable bonus with a pity cap |
| Points, ranks, levels, badges | `shared/scoring.js`, `shared/achievements.js` | Badge engine (`check(ctx)` per badge) is generic; rewrite the definitions |
| Result screen + day wrap-up | `components/ResultModal.tsx`, `pages/DayDone.tsx` | "Keep going or done for today?", wrap-up page |
| Family board | `pages/Leaderboard.tsx`, `getLeaderboard` in `server/game.js` | Weekly / all-time / rating tabs |
| Step-through lessons | `pages/Lesson.tsx`, `game/useLesson.ts` | Board + arrow + one sentence per move, autoplay, "back to the puzzle" bar. The line source changes (opening tree instead of tablebase) |
| External chess API proxy | `server/tablebase.js`, `client/src/tablebase.ts` | Edge cache + D1 cache, writes after responding, fail fast on 429, client races server vs direct after 600 ms. Same pattern suits the Lichess opening explorer (`explorer.lichess.ovh` masters / lichess / player) |
| Game analysis pipeline | `analysis/` (fetch chess.com archives, python-chess passes, report) | Retarget from endgames to openings: lines played per colour, results and where the player left theory |

## Endgame-specific (don't copy)

`shared/drills.js`, `shared/puzzles.json`, `shared/grading.js` (tablebase DTM
grading), `shared/hints.js`, `shared/symmetry.js`, `client/src/game/useDrill.ts`,
`scripts/generate-puzzles.mjs`, and the endgame pages (`Drills`, `Learn`,
`School`, `Play`) except as layout references.

## Deploying (what actually worked here)

* Cloudflare account with the `garlick.ca` zone. This site is the Worker
  `garlick-endgames` with a D1 database bound as `DB`, on the free Workers
  custom domain `endgames.garlick.ca`. A sibling site should get its own
  Worker, its own D1 database and its own subdomain (e.g. `openings.garlick.ca`).
* There is **no Cloudflare API token in the cloud environment** (one request
  was declined; don't use a Global API Key). Deploys go through the Cloudflare
  connector instead: commit `deploy/worker.js`, have Browser Rendering's
  `/content` endpoint fetch it from `raw.githubusercontent.com` at the exact
  commit SHA (the connector's sandbox can't reach GitHub itself), check its
  SHA-256 and length, then `PUT` it as a multipart module upload to
  `/accounts/{id}/workers/scripts/{name}` with the D1 binding and
  `compatibility_date: 2025-09-01`. This needs the repo to be public.
* After a deploy, wait a few seconds before smoke-testing (the new version
  takes a moment to reach every edge). Browser Rendering is rate-limited and
  connector calls time out at 60 s, so keep live checks short; live checks
  create `smoketest*` users and delete them from D1 afterwards.
* Local Worker testing: `npx wrangler@4 dev --local` against the bundle, with
  logs outside watched folders. Lichess rate-limits heavy automated testing;
  pace e2e runs.

## Lessons learned (avoid repeating these bugs)

* Phones: a grid with `place-items: center` and a child of `width: min(…, 100%)`
  spills off the left edge. Use `grid-template-columns: minmax(0, 1fr)` and
  `min-width: 0`, and keep `body { overflow-x: hidden }` as a guard. Test at
  320-414 px and with 125% text.
* More than ~5 nav items don't fit a phone header: use the bottom tab bar.
* D1 reads are network round trips (~25 ms each): fetch independent reads with
  `Promise.all` (saving an attempt went from 0.55 s to 0.3 s).
* Secure cookies don't work over plain http locally; the API only sets
  `Secure` on https.
* Rule changes that affect stored ratings need a data migration that clears
  and rebuilds them from history (see `DATA_MIGRATIONS`).
* Long-open phone tabs keep old code: the client compares its script hash with
  the live one and reloads between puzzles.

## About the owner's preferences

* A family of adults, each with their own login and chess rating. The owner
  plays on chess.com as `ham_sandmitch` (rapid about 1200-1320, blitz about
  1120) and mostly uses an iPhone (Chrome).
* Wants a chess.com-like look, the Garlick branding (the cartoon garlic bulb),
  research-backed design choices, the site deployed and checked live, and a
  list of open questions at the end of each piece of work.
* Gamification settled here: daily 5-clove bulb, full clove for work at your
  level, streak shields and repair, golden cloves, "done for today", a
  curriculum that graduates items after 10 correct in a row, and an Elo-style
  rating. Background research is in `docs/RESEARCH.md`.

## Open decision for a sibling site

Separate accounts (own D1, cleanest) or shared family logins across
`*.garlick.ca` (one users/sessions database, session cookie scoped to
`.garlick.ca`). Decide before building the auth layer.
