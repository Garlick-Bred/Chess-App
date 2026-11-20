// Endgame School + endgame rating walkthrough.
//   node scripts/e2e-school.cjs <outDir> [baseUrl] [history.json]
// history.json: optional list of past attempts ({d: drillId, l: level, s, h, w, t, e})
// to replay first, so the School starts from a realistic state.
const { chromium, devices } = require('playwright');
const fs = require('fs');

const OUT = process.argv[2] || '/tmp/e2e-school';
const BASE = process.argv[3] || 'http://localhost:8787';
const HISTORY = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : [];
fs.mkdirSync(OUT, { recursive: true });
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
    if (uci.length > 4) {
      // Promotion: pick the piece the tablebase chose (queen first in the picker).
      const order = { q: 0, n: 1, r: 2, b: 3 };
      const btn = await page.waitForSelector('.promo-choice', { timeout: 3000 }).catch(() => null);
      if (btn) await page.click(`.promo-choice >> nth=${order[uci[4]] ?? 0}`);
    }
    await page.waitForTimeout(120);
  }
}
const text = async (page, sel) => ((await page.$(sel)) ? (await page.textContent(sel)).replace(/\s+/g, ' ').trim() : null);
async function postAttempts(page, list) {
  await page.evaluate(async (list) => {
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const a of list) {
      await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ drillId: a.d, level: a.l, success: !!a.s, hints: a.h, writtenHints: a.w, takebacks: a.t, durationMs: 30000, userMoves: a.s ? 8 : 6, wastePlies: Math.round((1 - a.e) * 10), mateIn: 8, day, mode: a.mode }),
      });
    }
  }, list);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(BASE);
  await page.waitForSelector('.auth-card');
  await page.click('button:has-text("New account")');
  await page.fill('input[autocomplete=username]', `school${Date.now() % 100000}`);
  await page.fill('input[type=password]', 'garlick123');
  await page.fill('input[aria-label="Chess rating"]', '1200');
  await page.click('button:has-text("Create account")');
  await page.waitForSelector('.hero');
  if (HISTORY.length) await postAttempts(page, HISTORY);
  await page.reload();
  await page.waitForSelector('.school-card');
  log('home school card:', await text(page, '.school-card'));
  await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

  await page.goto(`${BASE}/#/school`);
  await page.waitForSelector('.school-hero');
  await page.waitForTimeout(500);
  log('school page rating:', await text(page, '.school-hero .eg-rating'));
  await page.screenshot({ path: `${OUT}/02-school.png`, fullPage: true });

  // Three School rounds: should rotate between drills.
  await page.click('.school-hero button:has-text("Start School")');
  const seen = [];
  for (let round = 0; round < 3; round++) {
    await page.waitForSelector('.board.interactive', { timeout: 30000 });
    seen.push(`${await text(page, '.panel-head h2')} [${await text(page, '.eyebrow')}] [${await text(page, '.clove-chip')}]`);
    await playToEnd(page);
    await page.waitForSelector('.rating-line', { timeout: 15000 });
    await page.waitForTimeout(1500);
    log(`round ${round + 1}:`, seen[round], '|', await text(page, '.rating-line'), '|', await text(page, '.school-note'), '|', await text(page, '.bulb-caption'));
    if (round === 0) await page.screenshot({ path: `${OUT}/03-school-result.png` });
    await page.click('.result-actions button:has-text("Next puzzle"), .result-actions button:has-text("Keep going")');
    await page.waitForTimeout(400);
  }

  // Graduation: solves via the API up to one short of the target, the last on the board.
  const me = await page.evaluate(async () => (await fetch('/api/me')).json());
  const toGo = 10 - 1 - me.progress['kpk-win'].cleanStreak;
  await postAttempts(page, Array.from({ length: toGo }, () => ({ d: 'kpk-win', l: 2, s: 1, h: 0, w: 0, t: 0, e: 1 })));
  await page.goto(`${BASE}/#/play/kpk-win`);
  await page.reload();
  await page.waitForSelector('.board.interactive', { timeout: 30000 });
  await playToEnd(page);
  await page.waitForSelector('.modal.result', { timeout: 15000 });
  await page.waitForTimeout(2500);
  log('graduation:', await text(page, '.school-note'), '| modal:', (await text(page, '.modal.result')).slice(0, 300));
  await page.screenshot({ path: `${OUT}/04-graduated.png` });

  // Phone views.
  const phone = await browser.newContext({ ...devices['iPhone 13'], storageState: await ctx.storageState() });
  const p2 = await phone.newPage();
  p2.on('pageerror', (e) => errors.push(`phone pageerror: ${e.message}`));
  await p2.goto(BASE);
  await p2.waitForSelector('.school-card');
  await p2.screenshot({ path: `${OUT}/05-phone-home.png`, fullPage: true });
  await p2.goto(`${BASE}/#/school`);
  await p2.waitForSelector('.school-hero');
  await p2.waitForTimeout(400);
  await p2.screenshot({ path: `${OUT}/06-phone-school.png`, fullPage: true });
  const over = await p2.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => !e.closest('svg') && e.getBoundingClientRect().right > innerWidth + 1).length);
  log('phone overflow elements:', over);
  await p2.goto(`${BASE}/#/family`);
  await p2.waitForSelector('.lb-row');
  await p2.click('button:has-text("Endgame rating")');
  log('family (rating tab):', await text(p2, '.lb-row'));

  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
