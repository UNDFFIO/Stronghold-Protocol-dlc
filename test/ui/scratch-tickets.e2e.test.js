import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find(existsSync);
const ENABLED = process.env.SP_E2E === '1' && CHROME;
let srv, browser, base;
before(async () => {
  if (!ENABLED) return;
  const { startServer } = await import('../../server/index.js');
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${srv.port}`;
  browser = await (await import('puppeteer-core')).default.launch({ executablePath: CHROME, headless: true, pipe: true,
    args: ['--no-sandbox', '--disable-gpu'] });
  mkdirSync('test/e2e/out', { recursive: true });
});
after(async () => { await browser?.close(); await srv?.close(); });

async function clickText(page, selector, text) {
  for (const button of await page.$$(selector)) if ((await button.evaluate((e) => e.textContent)).includes(text)) { await button.click(); return; }
  throw new Error(`button missing: ${text}`);
}
async function openShop(page) {
  await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.relic-icons__heading');
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('sp.scratch.')) localStorage.removeItem(key); });
  await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
    s.pub.round = 7; s.priv.alive = true; s.priv.ready = false; s.priv.funds = 100;
    s.priv.relics = [{ id: 'relic_234', round: 1 }];
    s.priv.scratch = { seq: 0, ticket: null, lastResult: null };
  }));
  await page.click('.scratch-shortcut');
  await page.waitForSelector('.scratch-product');
}
async function buyAndOpen(page) {
  await page.click('.scratch-product button');
  await page.waitForSelector('.scratch-unopened');
  await clickText(page, '.scratch-unopened button', '开始刮奖');
  await page.waitForSelector('.scratch-coating');
}
async function scratchRegion(page, region) {
  const handle = await page.$(`[data-scratch-region="${region}"] canvas`);
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 3, box.y + 3); await page.mouse.down();
  for (let row = 0; row < 8; row++) {
    const y = box.y + box.height * (row + 0.5) / 8;
    await page.mouse.move(box.x + (row % 2 ? box.width - 3 : 3), y);
    await page.mouse.move(box.x + (row % 2 ? 3 : box.width - 3), y, { steps: 9 });
  }
  await page.mouse.up();
  await page.waitForFunction((r) => document.querySelector('.scratch-result')
    || document.querySelector(`[data-scratch-region="${r}"]`)?.classList.contains('is-revealed'), {}, region);
}

test('scratch desktop: actual mouse erasure, saved progress, eight regions, one claim and reusable purchase slot', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 180000,
}, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport({ width: 1440, height: 1000 }); await openShop(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.scratch-product img')].every((i) => i.complete && i.naturalWidth > 0));
    assert.equal((await page.$$('.scratch-product')).length, 5);
    const alpha = await page.evaluate(() => [...document.querySelectorAll('.scratch-product img')].map((img) => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, 1, 1).data[3];
    }));
    assert.deepEqual(alpha, [0, 0, 0, 0, 0], 'real PNG alpha outside the ticket');
    await page.screenshot({ path: 'test/e2e/out/scratch-shop-desktop.png' });
    await buyAndOpen(page);
    assert.equal((await page.$$('.scratch-coating')).length, 8);
    const ticketId = await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.ticket.id);
    await scratchRegion(page, 0);
    assert.equal((await page.$$('.scratch-coating')).length, 7);
    await page.screenshot({ path: 'test/e2e/out/scratch-partial-desktop.png' });
    await page.click('.scratch-panel .modal__actions button');
    await page.click('.scratch-shortcut');
    await page.waitForSelector('[data-scratch-region="0"].is-revealed');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.ticket.id), ticketId);
    for (let region = 1; region < 8; region++) await scratchRegion(page, region);
    await page.waitForSelector('.scratch-result');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchClaim').length), 1);
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.ticket), null);
    assert.equal(await page.evaluate((id) => localStorage.getItem(`sp.scratch.${id}`), ticketId), null, 'claimed scratch data is removed');
    await page.click('.scratch-product button'); await page.waitForSelector('.scratch-unopened');
    assert.notEqual(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.ticket.id), ticketId);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('scratch mobile: real touch strokes, reload, phase gate, language switching and keyboard reveal', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 180000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await openShop(page); await buyAndOpen(page);
    const c = await page.$('[data-scratch-region="0"] canvas'), box = await c.boundingBox();
    const client = await page.createCDPSession();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 5, y: box.y + box.height / 2 }] });
    for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * i / 10, y: box.y + box.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem(`sp.scratch.${globalThis.__MOCK__.S().priv.scratch.ticket.id}`))).length > 0));
    const saved = await page.evaluate(() => ({ priv: structuredClone(globalThis.__MOCK__.S().priv), secret: structuredClone(globalThis.__MOCK__.S().scratchSecret) }));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.relic-icons__heading');
    await page.evaluate((saved) => globalThis.__MOCK__.mutate((s) => { s.pub.round = 7; s.priv = saved.priv; s.scratchSecret = saved.secret; }), saved);
    await page.click('.scratch-shortcut'); await page.waitForSelector('.scratch-coating');
    const coverage = await page.$eval('[data-scratch-region="0"] canvas', (e) => {
      const a = e.getContext('2d').getImageData(0, 0, 300, 100).data; let n = 0; for (let i = 3; i < a.length; i += 4) if (a[i] < 128) n++; return n;
    });
    assert.ok(coverage > 0, 'partial touch scratches survive reload');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.ready = true; }));
    assert.ok(await page.$eval('.scratch-controls button', (b) => b.disabled));
    await page.evaluate(async () => {
      const { initLang, switchLang } = await import('/js/ui/lang.js'); await initLang(); await switchLang('en');
      globalThis.__MOCK__.mutate((s) => { s.priv.ready = false; });
    });
    await page.waitForFunction(() => document.querySelector('.scratch-panel')?.textContent.includes('Winning numbers'));
    await page.screenshot({ path: 'test/e2e/out/scratch-mobile.png' });
    assert.equal(await page.$eval('.scratch-panel', (e) => e.getBoundingClientRect().right <= innerWidth), true);
    await page.focus('.scratch-controls button'); await page.keyboard.press('Enter');
    await page.waitForSelector('.scratch-result');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchClaim').length), 1);
  } finally { await page.close(); }
});
