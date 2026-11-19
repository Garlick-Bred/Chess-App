// Completing the bulb asks "keep going or done for today?".
//   node scripts/e2e-daydone.cjs <outDir> [baseUrl]
const { chromium, devices } = require('playwright');
const fs = require('fs');

const OUT = process.argv[2] || '/tmp/e2e-daydone';
const BASE = process.argv[3] || 'http://localhost:8787';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function center(page, sq) {
  const el = await page.$(`[data-square="${sq}"]`);
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function playToEnd(page) {
  for (let guard = 0; guard < 500; guard++) {
    const s = await page.evaluate(() => ({
      interactive: !!document.querySelector('.board.interactive'),
      done: !!document.querySelector('.modal.result'),
      fen: document.querySelector('.board')?.dataset.fen,
    }));
    if (s.done) return;
    if (!s.interactive) {
      await page.waitForTimeout(80);
      continue;
    }
    const tb = await (await fetch(`${BASE}/api/tablebase?fen=${encodeURIComponent(s.fen)}`)).json();
    const uci = tb.moves[0].uci;
    const a = await center(page, uci.slice(0, 2));
    const b = await center(page, uci.slice(2, 4));
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await page.waitForTimeout(120);
  }
}

async function run(ctxOpts, tag) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  await page.goto(BASE);
  await page.waitForSelector('.auth-card');
  await page.click('button:has-text("New account")');
  await page.fill('input[autocomplete=username]', `done${tag}${Date.now() % 100000}`);
  await page.fill('input[type=password]', 'garlick123');
  await page.fill('input[aria-label="Chess rating"]', '800');
  await page.click('button:has-text("Create account")');
  await page.waitForSelector('.hero');
  // Four quick rook-mate solves (a whole clove each at 800) straight through the API.
  await page.evaluate(async () => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (let i = 0; i < 4; i++) {
      await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drillId: 'krk', level: 1, success: true, durationMs: 20000, userMoves: 8, wastePlies: 0, mateIn: 8, day }),
      });
    }
  });
  await page.goto(`${BASE}/#/play/krk`);
  await page.reload();
  await page.waitForSelector('.board.interactive');
  await playToEnd(page);
  await page.waitForSelector('.day-choice');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `${OUT}/${tag}-1-choice.png` });
  // Enter must not skip the question.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log(tag, 'still asking after Enter:', !!(await page.$('.day-choice')));
  await page.click('button:has-text("Done for today")');
  await page.waitForSelector('.day-done-card');
  await page.waitForTimeout(5500);
  console.log(tag, 'summary:', (await page.textContent('.day-done-card')).replace(/\s+/g, ' ').slice(0, 220));
  await page.screenshot({ path: `${OUT}/${tag}-2-done.png`, fullPage: true });
  await page.click('button:has-text("Home")');
  await page.waitForSelector('.hero');
  console.log(tag, 'home h1:', await page.textContent('.hero h1'));
  await page.screenshot({ path: `${OUT}/${tag}-3-home.png` });
  await browser.close();
}

(async () => {
  await run({ viewport: { width: 1280, height: 860 } }, 'desk');
  await run({ ...devices['iPhone 13'] }, 'phone');
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
