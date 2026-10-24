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

async function toggle(page) {
  // The mobile shop covers the existing corner settings entry until folded.
  if (await page.$('.funds__collapse')) await page.click('.funds__collapse');
  await page.waitForSelector('.gm__gear[aria-label="设置"]', { visible: true, timeout: 5000 });
  await page.click('.gm__gear[aria-label="设置"]');
  await page.waitForSelector('.set-list', { timeout: 5000 });
  await page.evaluate(() => [...document.querySelectorAll('.set-row')].find((e) => e.textContent.includes('RELIC DEBUG')).querySelector('[role="switch"]').click());
  await page.evaluate(() => [...document.querySelectorAll('.modal button')].find((b) => b.textContent.includes('完成')).click());
}

for (const width of [1920, 640]) test(`solo collectible debug toggle and actions at ${width}px`, { skip: !ENABLED }, async () => {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const height = width === 640 ? 360 : 1080;
    await page.setViewport({ width, height });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP&render=fallback&variant=solo`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gm__gear');
    assert.equal(await page.$('.relic-debug'), null);
    // The mock supplies authoritative private pushes; production mutation is tested in relic-debug.test.js.
    await page.evaluate(async () => {
      const { net } = await import('/js/net.js'); const original = net.request.bind(net);
      globalThis.__DEBUG_REQUESTS__ = [];
      net.request = async (type, fields) => {
        if (type !== 'g.relicDebug') return original(type, fields);
        globalThis.__DEBUG_REQUESTS__.push(fields);
        globalThis.__MOCK__.mutate((s) => {
          if (fields.action === 'add') s.priv.relics.push({ id: fields.relicId, round: s.pub.round });
          else s.priv.relics = s.priv.relics.filter((r) => r.id !== fields.relicId);
        });
        return {};
      };
      globalThis.__MOCK__.mutate((s) => { s.priv.ready = false; s.priv.relics = []; });
    });
    await toggle(page);
    await page.waitForSelector('.relic-debug');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.settings')).relicDebug), true);
    const beforeDrag = await page.$eval('.relic-debug', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
    const handle = await page.$eval('.relic-debug__heading span', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + 10, y: r.y + r.height / 2 }; });
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x + 80, handle.y + 20, { steps: 8 });
    await page.mouse.up();
    const afterDrag = await page.$eval('.relic-debug', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
    assert.ok(afterDrag.x > beforeDrag.x + 40, JSON.stringify({ beforeDrag, afterDrag }));
    assert.ok(await page.$('.relic-debug__body'), 'dragging does not collapse the panel');
    await page.mouse.move(handle.x + 80, handle.y + 20);
    await page.mouse.down();
    await page.mouse.move(width * 2, height * 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => {
      const r = document.querySelector('.relic-debug').getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    });
    await page.setViewport({ width: width - 80, height: height - 40 });
    await page.waitForFunction(() => {
      const r = document.querySelector('.relic-debug').getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    });
    await page.setViewport({ width, height });
    await page.click('.relic-debug__heading button');
    await page.waitForFunction(() => !document.querySelector('.relic-debug__body'));
    await page.click('.relic-debug__heading button');
    await page.waitForSelector('.relic-debug input');
    assert.equal(await page.$('.relic-debug select'), null);
    const grid = await page.$eval('.relic-debug__grid', (e) => {
      const cards = [...e.querySelectorAll('button')];
      const colors = new Map(cards.filter((b) => b.getAttribute('aria-pressed') === 'false')
        .map((b) => [b.className.match(/relic-tier-\d/)[0], getComputedStyle(b).backgroundColor]));
      return { display: getComputedStyle(e).display, count: cards.length, tiers: colors.size,
        colors: new Set(colors.values()).size,
        hasArtAndName: cards.every((b) => b.querySelector('.relic-debug__art img, .relic-debug__art .icon') && b.textContent.trim()) };
    });
    assert.equal(grid.display, 'grid');
    assert.ok(grid.count > 1 && grid.hasArtAndName);
    assert.ok(grid.tiers >= 5);
    assert.equal(grid.colors, grid.tiers, 'each quality has a distinct background');
    await page.click('.relic-debug__pick:nth-child(2)');
    assert.equal(await page.$eval('.relic-debug__pick:nth-child(2)', (e) => e.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$$eval('.relic-debug__pick[aria-pressed="true"]', (els) => els.length), 1);
    await page.type('.relic-debug input', 'no-such-collectible');
    assert.equal(await page.$$eval('.relic-debug__pick', (els) => els.length), 0);
    assert.equal(await page.$eval('.relic-debug__body > .btn', (e) => e.disabled), true);
    await page.$eval('.relic-debug input', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.type('.relic-debug input', 'relic_003');
    assert.equal(await page.$$eval('.relic-debug__pick', (els) => els.length), 1);
    assert.equal(await page.$eval('.relic-debug__pick', (e) => e.dataset.relicId), 'relic_003');
    await page.click('.relic-debug__body > .btn');
    await page.waitForSelector('.relic-debug__owned li');
    assert.deepEqual(await page.evaluate(() => globalThis.__DEBUG_REQUESTS__[0]), { relicId: 'relic_003', action: 'add' });
    await page.click('.relic-debug__owned .btn');
    await page.waitForFunction(() => !document.querySelector('.relic-debug__owned li'));
    assert.deepEqual(await page.evaluate(() => globalThis.__DEBUG_REQUESTS__[1]), { relicId: 'relic_003', action: 'remove' });
    await page.$eval('.relic-debug input', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.ready = true; }));
    await page.waitForFunction(() => document.querySelector('.relic-debug__body > .btn').disabled);
    await page.screenshot({ path: `test/e2e/out/relic-debug-${width}.png` });
    const box = await page.$eval('.relic-debug', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
    assert.ok(box.left >= 0 && box.right <= width && box.bottom <= height, JSON.stringify(box));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-debug');
    await page.evaluate(() => globalThis.__MOCK__.setPhase('COMBAT', 'solo'));
    await page.waitForFunction(() => document.querySelector('.relic-debug__body > .btn').disabled);
    await toggle(page);
    await page.waitForFunction(() => !document.querySelector('.relic-debug'));
    assert.deepEqual(errors, []);
  } catch (error) {
    await page.screenshot({ path: `test/e2e/out/relic-debug-failed-${width}.png` });
    throw error;
  } finally { await page.close(); }
});

test('public URL hides the solo debug switch and saved enabled panel', { skip: !ENABLED }, async () => {
  const page = await browser.newPage();
  try {
    // Serve the same fixture under a public-looking origin without external networking.
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      if (url.hostname !== 'example.test') return request.continue();
      const response = await fetch(`${base}${url.pathname}${url.search}`);
      await request.respond({ status: response.status, contentType: response.headers.get('content-type') || 'text/plain',
        body: Buffer.from(await response.arrayBuffer()) });
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem('sp.pref.settings', JSON.stringify({ relicDebug: true })));
    await page.goto('http://example.test/dev/game-mock.html?shot=1&phase=PREP&render=fallback&variant=solo', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gm__gear');
    assert.equal(await page.$('.relic-debug'), null);
    await page.click('.gm__gear[aria-label="设置"]');
    await page.waitForSelector('.set-list');
    assert.equal(await page.$eval('.set-list', (e) => e.textContent.includes('RELIC DEBUG')), false);
  } finally { await page.close(); }
});

test('co-op never shows collectible debug even with a saved enabled preference', { skip: !ENABLED }, async () => {
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument(() => localStorage.setItem('sp.pref.settings', JSON.stringify({ relicDebug: true })));
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP&render=fallback`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.gm__gear');
    assert.equal(await page.$('.relic-debug'), null);
    await page.click('.gm__gear[aria-label="设置"]');
    await page.waitForSelector('.set-list');
    assert.equal(await page.$eval('.set-list', (e) => e.textContent.includes('RELIC DEBUG')), false);
  } finally { await page.close(); }
});
