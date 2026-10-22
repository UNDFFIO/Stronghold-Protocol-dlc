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
    await page.type('.relic-debug input', 'relic_003');
    assert.equal(await page.$$eval('.relic-debug option', (els) => els.length), 1);
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
