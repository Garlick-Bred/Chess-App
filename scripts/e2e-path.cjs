// The Garlick Path: Home card, the map, and a world-up on the result screen.
//   node scripts/e2e-path.cjs <outDir> <baseUrl> <sqliteDbFile>
// Places the test user near a stage boundary directly in the local database
// (never point this at a real deployment).
const { chromium, devices } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const [OUT, BASE, DB] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const db = new DatabaseSync(DB);
const errors = [];
const log = (...a) => console.log(...a);

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
const text = async (page, sel) => ((await page.$(sel)) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : null);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const name = `path${Date.now() % 100000}`;
  await page.goto(BASE);
  await page.waitForSelector('.auth-card');
  await page.click('button:has-text("New account")');
  await page.fill('input[autocomplete=username]', name);
  await page.fill('input[type=password]', 'garlick123');
  await page.fill('input[aria-label="Chess rating"]', '800');
  await page.click('button:has-text("Create account")');
  await page.waitForSelector('.hero');
  const uid = db.prepare('SELECT id FROM users WHERE username = ?').get(name).id;
  // 890 points: ten short of World 2 (900).
  db.prepare("INSERT INTO days (user_id, day, cloves, bulb_done, bonus) VALUES (?, '2026-01-01', 0, 0, 890)").run(uid);
  await page.reload();
  await page.waitForSelector('.path-card');
  log('header pill:', await text(page, '.points-pill'));
  log('home path card:', await text(page, '.path-card'));
  await (await page.$('.path-card')).screenshot({ path: `${OUT}/01-path-card.png` });

  await page.goto(`${BASE}/#/path`);
  await page.waitForSelector('.node.here');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-path-map-phone.png` });

  await page.goto(`${BASE}/#/play/krk`);
  await page.waitForSelector('.board.interactive', { timeout: 30000 });
  await playToEnd(page);
  await page.waitForSelector('.world-up', { timeout: 15000 });
  await page.waitForTimeout(2600);
  log('result path:', await text(page, '.path-progress'));
  await (await page.$('.path-progress')).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/03-world-up.png` });
  const over = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && e.getBoundingClientRect().right > innerWidth + 1).length);
  log('phone overflow elements:', over);

  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: await ctx.storageState() });
  const p2 = await desk.newPage();
  p2.on('pageerror', (e) => errors.push(`desk pageerror: ${e.message}`));
  await p2.goto(`${BASE}/#/path`);
  await p2.waitForSelector('.node.here');
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}/04-path-map-desktop.png` });
  await p2.goto(`${BASE}/#/family`);
  await p2.waitForSelector('.lb-row');
  log('family row:', await text(p2, '.lb-row'));

  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
