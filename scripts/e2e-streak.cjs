// Streak shields, repairs and golden cloves, on a local server.
//   node scripts/e2e-streak.cjs <outDir> <baseUrl> <sqliteDbFile>
// Sets up scenarios directly in the local database (never point this at a
// real deployment).
const { chromium, devices } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');

const [OUT, BASE, DB] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const db = new DatabaseSync(DB);
const errors = [];
const log = (...a) => console.log(...a);
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n) => dayOf(new Date(Date.now() - n * 86400000));

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
async function signUp(page, name, rating) {
  await page.goto(BASE);
  await page.waitForSelector('.auth-card');
  await page.click('button:has-text("New account")');
  await page.fill('input[autocomplete=username]', name);
  await page.fill('input[type=password]', 'garlick123');
  await page.fill('input[aria-label="Chess rating"]', String(rating));
  await page.click('button:has-text("Create account")');
  await page.waitForSelector('.hero');
  return db.prepare('SELECT id FROM users WHERE username = ?').get(name).id;
}
const text = async (page, sel) => ((await page.$(sel)) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : null);

(async () => {
  const browser = await chromium.launch();
  const stamp = Date.now() % 100000;

  // 1) Golden clove + shield woven in the same solve.
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const uid = await signUp(page, `gold${stamp}`, 800);
  const today = daysAgo(0);
  // 9 cloves already today (a full bulb + 4 woven), and the next eligible solve is guaranteed golden.
  db.prepare('INSERT INTO days (user_id, day, cloves, bulb_done, bonus) VALUES (?,?,9,1,50)').run(uid, today);
  db.prepare('UPDATE users SET braid = 4, golden_since = 14 WHERE id = ?').run(uid);
  await page.goto(`${BASE}/#/play/krk`);
  await page.reload();
  await page.waitForSelector('.board.interactive', { timeout: 30000 });
  await playToEnd(page);
  await page.waitForSelector('.golden-banner', { timeout: 15000 });
  await page.waitForTimeout(2200);
  log('golden:', await text(page, '.golden-banner'));
  log('shield:', await text(page, '.shield-note'));
  log('caption:', await text(page, '.bulb-caption'));
  await (await page.$('.golden-banner')).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/01-golden-and-shield.png` });

  // 2) Next visit after a missed day: the shield covers it.
  db.prepare('DELETE FROM days WHERE user_id = ?').run(uid);
  for (const n of [3, 2]) db.prepare('INSERT INTO days (user_id, day, cloves, bulb_done, bonus) VALUES (?,?,5,1,50)').run(uid, daysAgo(n));
  db.prepare('UPDATE users SET shields = 1 WHERE id = ?').run(uid);
  await page.goto(BASE);
  await page.reload();
  await page.waitForSelector('.hero');
  log('shield used notice:', await text(page, '.streak-notice'));
  log('hero streak:', await text(page, '.hero p'));
  await page.screenshot({ path: `${OUT}/02-shield-used.png` });

  // 3) Missed yesterday with no shield: repair offer, then a double bulb repairs it.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(`pageerror2: ${e.message}`));
  const uid2 = await signUp(p2, `repair${stamp}`, 800);
  for (const n of [4, 3, 2]) db.prepare('INSERT INTO days (user_id, day, cloves, bulb_done, bonus) VALUES (?,?,5,1,50)').run(uid2, daysAgo(n));
  db.prepare('INSERT INTO days (user_id, day, cloves, bulb_done, bonus) VALUES (?,?,9,1,50)').run(uid2, today);
  await p2.reload();
  await p2.waitForSelector('.streak-notice');
  log('repair notice:', await text(p2, '.streak-notice'));
  await p2.screenshot({ path: `${OUT}/03-repair-offer.png` });
  await p2.goto(`${BASE}/#/play/krk`);
  await p2.waitForSelector('.board.interactive', { timeout: 30000 });
  await playToEnd(p2);
  await p2.waitForSelector('.school-note.pass', { timeout: 15000 });
  await p2.waitForTimeout(1500);
  log('repaired:', await text(p2, '.school-note.pass'));
  await p2.screenshot({ path: `${OUT}/04-repaired.png` });
  await p2.goto(`${BASE}/#/stats`);
  await p2.waitForSelector('.tiles');
  log('stats tiles:', await text(p2, '.tiles'));

  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
