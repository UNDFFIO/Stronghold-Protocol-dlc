import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);

describe('shop overlap hides the bottom-left controls', { skip: !ENABLED && 'set SP_E2E=1 and CHROME_PATH' }, () => {
  let srv, browser, base;
  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  test('slot growth, folding, resizing and combat restore visibility without changing the footprint', async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/game-mock.html?phase=PREP&render=fallback`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.gm__corner');
    const waitCovered = (covered) => page.waitForFunction((want) => {
      const corner = document.querySelector('.gm__corner');
      return corner && corner.inert === want && (getComputedStyle(corner).visibility === 'hidden') === want;
    }, { timeout: 5000 }, covered).catch(async (error) => {
      const state = await page.evaluate(() => ({
        corner: document.querySelector('.gm__corner')?.outerHTML.slice(0, 180),
        row: !!document.querySelector('.shopbar__row'), tab: !!document.querySelector('.shopbar-tab'),
      }));
      throw new Error(`${error.message}: ${JSON.stringify(state)}`);
    });
    const slots = (count) => page.evaluate((n) => globalThis.__MOCK__.mutate((s) => {
      const card = s.priv.shop.slots.find((slot) => slot?.kind === 'chess');
      const item = s.priv.shop.slots.find((slot) => slot?.kind === 'item');
      s.priv.shop.slots = [...Array.from({ length: n }, () => ({ ...card })), ...(item ? [{ ...item }] : [])];
    }), count);
    await slots(3);
    await waitCovered(false);
    const width = await page.$eval('.gm__corner', (el) => el.getBoundingClientRect().width);
    await slots(8);
    await waitCovered(true);
    assert.equal(await page.$eval('.gm__corner', (el) => el.getBoundingClientRect().width), width);
    // Still hidden after observer callbacks: no hide/measure/show loop.
    await new Promise((resolve) => setTimeout(resolve, 150));
    await waitCovered(true);
    await page.$eval('.funds__collapse', (button) => button.click());
    await waitCovered(false);
    await page.$eval('.shopbar-tab__btn', (button) => button.click());
    await waitCovered(true);
    await page.setViewport({ width: 2800, height: 1080 });
    await waitCovered(false);
    await page.setViewport({ width: 1920, height: 1080 });
    await waitCovered(true);
    await slots(3);
    await waitCovered(false);
    await slots(8);
    await waitCovered(true);
    await page.evaluate(() => globalThis.__MOCK__.setPhase('COMBAT'));
    await waitCovered(false);
    assert.deepEqual(errors, []);
    await page.close();
  });
});
