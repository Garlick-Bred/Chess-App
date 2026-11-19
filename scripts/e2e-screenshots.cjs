// End-to-end walkthrough with Playwright: registers an account, solves drills
// by tapping and by dragging pieces, triggers a blunder + takeback, fills the
// daily garlic bulb, and screenshots every page.
//   node scripts/e2e-screenshots.cjs <outDir> [baseUrl]
const { chromium, devices } = require('playwright');
const fs = require('fs');

const OUT = process.argv[2] || 'docs/screenshots';
const BASE = process.argv[3] || 'http://localhost:8787';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function tbMoves(fen) {
  const r = await fetch(`${BASE}/api/tablebase?fen=${encodeURIComponent(fen)}`);
  return (await r.json()).moves;
}

async function center(page, sq) {
  const b = await (await page.$(`[data-square="${sq}"]`)).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function state(page) {
  return page.evaluate(() => ({
    interactive: !!document.querySelector('.board.interactive'),
    done: !!document.querySelector('.modal.result'),
    blunder: !!document.querySelector('.blunder-card'),
    fen: document.querySelector('.board')?.dataset.fen,
  }));
}

/** Play a drill to the end with tablebase-best moves. */
async function solve(page, drill, opts = {}) {
  await page.goto(`${BASE}/#/play/${drill}`);
  await page.waitForSelector('.board[data-fen]');
  let n = 0;
  let blundered = false;
  for (let guard = 0; guard < 600; guard++) {
    const s = await state(page);
    if (s.done) break;
    if (!s.interactive) {
      await page.waitForTimeout(80);
      continue;
    }
    const moves = await tbMoves(s.fen);
    let mv = moves[0];
    let blunderNow = false;
    if (opts.blunderAt != null && !blundered && n >= opts.blunderAt) {
      // the first move from here on that throws the result away
      const bad = moves.find((m) => m.category === 'draw' || m.category === 'win');
      if (bad) {
        mv = bad;
        blunderNow = blundered = true;
      }
    }
    const from = await center(page, mv.uci.slice(0, 2));
    const to = await center(page, mv.uci.slice(2, 4));
    if (opts.drag && n % 2 === 1) {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 10 });
      await page.mouse.up();
    } else {
      await page.mouse.click(from.x, from.y);
      if (opts.selectShot && n === 2) {
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${OUT}/${opts.selectShot}` });
      }
      await page.mouse.click(to.x, to.y);
    }
    if (mv.uci.length === 5 && !opts.autoQueen) {
      await page.waitForSelector('.promo-choice', { timeout: 2000 }).catch(() => undefined);
      const choice = await page.$('.promo-choice');
      if (choice) await choice.dispatchEvent('pointerdown');
    }
    n++;
    if (blunderNow) {
      await page.waitForSelector('.blunder-card');
      await page.waitForTimeout(400);
      if (opts.blunderShot) await page.screenshot({ path: `${OUT}/${opts.blunderShot}` });
      await page.click('button:has-text("Take back")');
    }
    if (opts.midShot && n === opts.midShotAt) {
      await page.waitForFunction(() => document.querySelector('.board.interactive') || document.querySelector('.modal.result'));
      if (!(await state(page)).done) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${opts.midShot}` });
      }
    }
  }
  await page.waitForSelector('.modal.result', { timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

  await page.goto(BASE);
  await page.waitForSelector('.auth-card');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/01-login.png` });
  await page.fill('input[autocomplete=username]', 'mitch');
  await page.fill('input[placeholder="What the family sees"]', 'Mitch');
  await page.fill('input[type=password]', 'garlic123');
  await page.click('button:has-text("Create account")');
  await page.waitForSelector('.hero');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-home-new.png` });
  // Link the chess.com account so the home page shows the game-based insights.
  await page.goto(`${BASE}/#/settings`);
  await page.fill('input[placeholder="e.g. ham_sandmitch"]', 'ham_sandmitch');
  await page.click('button:has-text("Save")');
  await page.waitForSelector('.form-ok');

  await page.goto(`${BASE}/#/drills`);
  await page.waitForSelector('.drill-card');
  await page.screenshot({ path: `${OUT}/03-drills.png`, fullPage: true });
  await page.goto(`${BASE}/#/drills/krk`);
  await page.waitForSelector('.drill-detail');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-drill-detail.png` });

  // 1: rook mate, tapping + dragging, with a selection screenshot and a mid-game shot
  await solve(page, 'krk', { drag: true, selectShot: '05-play-selected.png', midShot: '06-play-graded.png', midShotAt: 3 });
  await page.waitForTimeout(2300);
  await page.screenshot({ path: `${OUT}/08-result-clove.png` });

  // 2: queen mate with a deliberate blunder + takeback
  await solve(page, 'kqk', { blunderAt: 1, blunderShot: '07-blunder.png' });
  // 3-4: more cloves
  await solve(page, 'kpk-draw', { drag: true });
  await solve(page, 'lucena', {});
  // 5: completes the bulb - capture the celebration
  await solve(page, 'krrk', { drag: true });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/09-bulb-celebrating.png` });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/10-bulb-complete.png` });

  await page.goto(`${BASE}/#/`);
  await page.waitForSelector('.hero');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/11-home-after.png`, fullPage: true });
  await page.goto(`${BASE}/#/stats`);
  await page.waitForSelector('.tiles');
  await page.screenshot({ path: `${OUT}/12-stats.png`, fullPage: true });
  await page.goto(`${BASE}/#/badges`);
  await page.waitForSelector('.badge-grid');
  await page.screenshot({ path: `${OUT}/13-badges.png`, fullPage: true });

  // A second family member on a phone.
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(`phone pageerror: ${e.message}`));
  await p2.goto(BASE);
  await p2.waitForSelector('.auth-card');
  await p2.click('button:has-text("New account")');
  await p2.fill('input[autocomplete=username]', 'grandma');
  await p2.fill('input[placeholder="What the family sees"]', 'Grandma');
  await p2.fill('input[type=password]', 'knitting1');
  await p2.click('button:has-text("Create account")');
  await p2.waitForSelector('.hero');
  await p2.screenshot({ path: `${OUT}/14-phone-home.png` });
  await solve(p2, 'kqk', { midShot: '15-phone-play.png', midShotAt: 2 });
  await p2.waitForTimeout(2300);
  await p2.screenshot({ path: `${OUT}/16-phone-result.png` });

  await page.goto(`${BASE}/#/family`);
  await page.waitForSelector('.lb-row');
  await page.screenshot({ path: `${OUT}/17-family.png`, fullPage: true });

  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
