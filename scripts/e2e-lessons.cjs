// Walkthrough of hints, premoves and lessons:
//   give up a puzzle -> "Show me how" -> step through the lesson -> replay it
//   (should earn a full clove), plus written hint, piece hint and a premove.
//   node scripts/e2e-lessons.cjs <outDir> [baseUrl]
const { chromium, devices } = require('playwright');
const fs = require('fs');

const OUT = process.argv[2] || '/tmp/e2e-lessons';
const BASE = process.argv[3] || 'http://localhost:8787';
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const log = (...a) => console.log(...a);

async function tbMoves(fen) {
  const r = await fetch(`${BASE}/api/tablebase?fen=${encodeURIComponent(fen)}`);
  return (await r.json()).moves;
}
async function center(page, sq) {
  const el = await page.$(`[data-square="${sq}"]`);
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const state = (page) =>
  page.evaluate(() => ({
    interactive: !!document.querySelector('.board.interactive'),
    done: !!document.querySelector('.modal.result'),
    fen: document.querySelector('.board')?.dataset.fen,
  }));
async function tap(page, from, to) {
  const a = await center(page, from);
  const b = await center(page, to);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
}
async function playToEnd(page) {
  for (let guard = 0; guard < 500; guard++) {
    const s = await state(page);
    if (s.done) return;
    if (!s.interactive) {
      await page.waitForTimeout(80);
      continue;
    }
    const mv = (await tbMoves(s.fen))[0];
    await tap(page, mv.uci.slice(0, 2), mv.uci.slice(2, 4));
    await page.waitForTimeout(120);
  }
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(BASE);
  await page.waitForSelector('.auth-card');
  await page.click('button:has-text("New account")');
  await page.fill('input[autocomplete=username]', `lesson${Date.now() % 100000}`);
  await page.fill('input[type=password]', 'garlick123');
  await page.fill('input[aria-label="Chess rating"]', '1300');
  await page.click('button:has-text("Create account")');
  await page.waitForSelector('.hero');

  // --- Hints: written idea, then highlight the piece.
  await page.goto(`${BASE}/#/play/krk`);
  await page.waitForSelector('.board.interactive');
  await page.click('button:has-text("Hint")');
  await page.waitForSelector('.hint-box');
  log('written hint:', await page.textContent('.hint-box'));
  await page.click('button:has-text("Show piece")');
  await page.waitForSelector('.sq.hint');
  log('piece hint on:', await page.evaluate(() => document.querySelector('.sq.hint')?.dataset.square));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/01-hints.png` });

  // --- Premove: move, then immediately queue the next move during the computer's turn.
  let s = await state(page);
  let mv = (await tbMoves(s.fen))[0];
  await tap(page, mv.uci.slice(0, 2), mv.uci.slice(2, 4));
  // While the computer thinks, queue a rook move as a premove.
  s = await state(page);
  log('premove phase interactive?', s.interactive, '(false means we can premove now)');
  const rookSq = await page.evaluate(() => {
    const fen = document.querySelector('.board').dataset.fen;
    const userWhite = fen.split(' ')[1] === 'b'; // computer to move, so the user is the other side
    const rows = fen.split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) f += Number(ch);
        else {
          if (ch === (userWhite ? 'R' : 'r')) return 'abcdefgh'[f] + (8 - r);
          f++;
        }
      }
    }
    return null;
  });
  if (rookSq && !s.interactive) {
    const a = await center(page, rookSq);
    await page.mouse.click(a.x, a.y);
    const dot = await page.evaluate(() => {
      const d = document.querySelector('.move-dot, .capture-ring');
      return d ? d.parentElement.dataset.square : null;
    });
    if (dot) {
      const b = await center(page, dot);
      await page.mouse.click(b.x, b.y);
      const note = await page.$('.premove-note');
      log('premove queued:', !!note, rookSq, '->', dot);
      await page.screenshot({ path: `${OUT}/02-premove.png` });
    }
  }
  await page.waitForTimeout(1500);

  // --- Give up -> lesson -> replay.
  await page.click('button:has-text("Give up")');
  await page.waitForSelector('.modal.result');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/03-failed-show-me-how.png` });
  await page.click('button:has-text("Show me how")');
  await page.waitForSelector('.lesson-explain');
  await page.waitForFunction(() => !document.querySelector('.lesson-controls .btn.primary')?.disabled);
  await page.screenshot({ path: `${OUT}/04-lesson-start.png` });
  for (let i = 0; i < 3; i++) {
    await page.click('.lesson-controls .btn.primary');
    await page.waitForTimeout(350);
  }
  log('lesson step 3:', (await page.textContent('.lesson-explain')).replace(/\s+/g, ' ').slice(0, 160));
  await page.screenshot({ path: `${OUT}/05-lesson-step.png` });
  // Step to the end.
  for (let i = 0; i < 80; i++) {
    if (await page.$('.lesson-done')) break;
    const btn = await page.$('.lesson-controls .btn.primary:not([disabled])');
    if (btn) await btn.click();
    await page.waitForTimeout(150);
  }
  await page.waitForSelector('.lesson-done', { timeout: 60000 });
  log('lesson end:', (await page.textContent('.lesson-done')).replace(/\s+/g, ' ').slice(0, 120));
  await page.screenshot({ path: `${OUT}/06-lesson-done.png` });
  await page.click('button:has-text("Play it yourself")');
  await page.waitForSelector('.board[data-fen]');
  log('replay header:', (await page.textContent('.eyebrow')).replace(/\s+/g, ' '));
  await playToEnd(page);
  await page.waitForSelector('.result-points');
  await page.waitForTimeout(2200);
  log('replay result:', (await page.textContent('.bulb-caption')).replace(/\s+/g, ' '));
  await page.screenshot({ path: `${OUT}/07-replay-clove.png` });

  // --- Learn page on a phone.
  const phone = await browser.newContext({ ...devices['iPhone 13'], storageState: await ctx.storageState() });
  const p2 = await phone.newPage();
  await p2.goto(`${BASE}/#/learn`);
  await p2.waitForSelector('.lesson-cta');
  await p2.screenshot({ path: `${OUT}/08-phone-learn.png` });
  await p2.goto(`${BASE}/#/lesson/kbnk`);
  await p2.waitForFunction(() => !document.querySelector('.lesson-controls .btn.primary')?.disabled, null, { timeout: 30000 });
  for (let i = 0; i < 4; i++) {
    await p2.click('.lesson-controls .btn.primary');
    await p2.waitForTimeout(300);
  }
  await p2.screenshot({ path: `${OUT}/09-phone-lesson.png` });

  await browser.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})().catch((e) => {
  console.error(e);
  console.log(errors.join('\n'));
  process.exit(1);
});
