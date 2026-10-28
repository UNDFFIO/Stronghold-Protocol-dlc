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
async function openShop(page, render = 'engine') {
  await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP&render=${render}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.relic-icons__heading');
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('sp.scratch.')) localStorage.removeItem(key); });
  await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
    s.pub.round = 7; s.priv.alive = true; s.priv.ready = false; s.priv.funds = 100;
    s.priv.relics = [{ id: 'relic_234', round: 1 }];
    s.priv.scratch = { seq: 0, tickets: [], lastResult: null };
  }));
  await page.click('.scratch-shop-card');
  await page.waitForSelector('.scratch-product');
}
async function buyAndOpen(page) {
  await page.click('.scratch-product');
  await page.waitForSelector('.scratch-product.is-armed');
  await page.click('.scratch-product');
  await page.waitForSelector('.scratch-unopened');
  await clickText(page, '.scratch-unopened button', '开始刮奖');
  await page.waitForSelector('.scratch-coating');
}

test('extra rounds offer only Common through Rare scratch tickets and restore all tiers outside extra rounds', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await openShop(page, 'fallback');
    assert.equal((await page.$$('.scratch-product')).length, 5);
    await page.evaluate(() => globalThis.__MOCK__.mutate(s => {
      s.pub.round = 16; s.pub.extraRound = 1;
    }));
    await page.waitForFunction(() => document.querySelectorAll('.scratch-product').length === 3);
    assert.equal(await page.$('.scratch-product.relic-tier-4'), null);
    assert.equal(await page.$('.scratch-product.relic-tier-5'), null);
    await page.evaluate(() => globalThis.__MOCK__.mutate(s => { s.pub.extraRound = 0; }));
    await page.waitForFunction(() => document.querySelectorAll('.scratch-product').length === 5);
    await page.evaluate(() => globalThis.__MOCK__.mutate(s => { s.pub.extraRound = 1; }));
    await page.waitForFunction(() => document.querySelectorAll('.scratch-product').length === 3);
    await page.click('.scratch-product.relic-tier-3');
    await page.waitForSelector('.scratch-product.relic-tier-3.is-armed');
    await page.click('.scratch-product.relic-tier-3');
    await page.waitForSelector('.scratch-unopened');
    assert.ok(await page.$eval('.scratch-unopened', el => el.textContent.includes('稀有刮刮票')));
  } finally { await page.close(); }
});

test('all five ticket backgrounds and square symbols load without false matches on desktop and mobile', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 120000,
}, async () => {
  let page = await browser.newPage();
  try {
    for (const width of [1440, 390]) for (let tier = 1; tier <= 5; tier++) {
      await page.setViewport({ width, height: width === 390 ? 844 : 1000 });
      await openShop(page, 'fallback');
      const selector = `.scratch-product:nth-child(${tier})`;
      await page.click(selector); await page.waitForSelector(`${selector}.is-armed`);
      await page.click(selector); await page.waitForSelector('.scratch-unopened');
      await page.evaluate(() => {
        const ticket = globalThis.__MOCK__.S().priv.scratch.tickets[0];
        localStorage.setItem(`sp.scratch.${ticket.id}`, JSON.stringify(Object.fromEntries(
          Array.from({ length: 7 }, (_, i) => [i, { done: true }]))));
      });
      await clickText(page, '.scratch-unopened button', '开始刮奖');
      await page.waitForSelector('.scratch-coating');
      const art = await page.$eval('.scratch-paper', async (el) => {
        const url = getComputedStyle(el).backgroundImage.match(/url\("?([^"\)]+)"?\)/)[1];
        const image = new Image(); image.src = url; await image.decode();
        return { url, width: image.naturalWidth, overflow: el.scrollWidth > el.clientWidth };
      });
      assert.ok(art.url.endsWith(`/tier-${tier}.webp`));
      assert.ok(art.width > 1000);
      assert.equal(art.overflow, false);
      assert.equal((await page.$$('.scratch-coating')).length, 1, 'seven saved regions reveal their symbols');
      const symbols = await page.$$eval('.scratch-symbol', async (els) => {
        const image = new Image();
        image.src = getComputedStyle(els[0]).backgroundImage.match(/url\("?([^"\)]+)"?\)/)[1];
        await image.decode();
        return els.map((el) => {
          const style = getComputedStyle(el), rect = el.getBoundingClientRect();
          return { url: image.src, position: style.backgroundPosition, square: rect.width === rect.height,
            label: el.getAttribute('aria-label') };
        });
      });
      assert.equal(symbols.length, 8);
      assert.ok(symbols.every((s) => s.square && s.url.endsWith(`/symbols-${tier}.webp`) && s.label));
      assert.equal(await page.$('.scratch-cell__value .num'), null, 'matching numbers are no longer visible');
      const values = await page.evaluate(() => {
        const ticket = globalThis.__MOCK__.S().priv.scratch.tickets[0];
        return [...ticket.winningNumbers, ...ticket.cells.map((c) => c.number)];
      });
      for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
        assert.equal(symbols[a].position === symbols[b].position, values[a] === values[b], 'symbol equality preserves the server result');
      }
      await page.waitForSelector('.pbanner--overlay', { hidden: true });
      await page.screenshot({ path: `test/e2e/out/scratch-background-${tier}-${width}.png` });
      await page.close();
      page = await browser.newPage();
    }
  } finally { await page.close(); }
});
async function waitForClaimClose(page) {
  await page.waitForSelector('.scratch-result');
  const result = await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.lastResult);
  const text = await page.$eval('.scratch-result', (el) => el.textContent);
  assert.ok(text.includes(result.amount > 0 ? String(result.amount) : '谢谢参与'));
  assert.equal(await page.$('.scratch-controls'), null, 'claimed ticket cannot be claimed again');
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 700)));
  assert.ok(await page.$('.scratch-result'), 'result remains readable before automatic close');
  await page.waitForFunction(() => !document.querySelector('.scratch-panel'));
}
async function scratchRegion(page, region) {
  const handle = await page.$(`[data-scratch-region="${region}"] canvas`);
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 3, box.y + 3); await page.mouse.down();
  for (let row = 0; row < 8; row++) {
    const y = box.y + box.height * (row + 0.5) / 8;
    await page.mouse.move(box.x + (row % 2 ? box.width - 3 : 3), y);
    await page.mouse.move(box.x + (row % 2 ? 3 : box.width - 3), y, { steps: 9 });
    if (!await page.$(`[data-scratch-region="${region}"] .scratch-coating`)) break;
  }
  await page.mouse.up();
  await page.waitForFunction((r) => document.querySelector('.scratch-shop')
    || document.querySelector(`[data-scratch-region="${r}"]`)?.classList.contains('is-revealed'), {}, region);
}

async function waitForDebris(page, visible) {
  await page.waitForFunction((expected) => {
    const canvas = document.querySelector('.scratch-debris');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let painted = false;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) { painted = true; break; }
    return painted === expected;
  }, { timeout: 3000 }, visible);
}

test('claimed ticket shows server win or loss on its face before closing', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    for (const amount of [10, 0]) {
      await openShop(page, 'fallback'); await buyAndOpen(page);
      await page.evaluate((amount) => {
        const s = globalThis.__MOCK__.S();
        s.scratchSecret[s.priv.scratch.tickets[0].id].amount = amount;
      }, amount);
      await clickText(page, '.scratch-controls button', '全部刮开');
      await page.waitForSelector('.scratch-result');
      assert.equal(await page.$eval('.scratch-result', (el) => el.textContent.trim()),
        amount ? '本次获得10资金' : '谢谢参与，下次好运');
      assert.equal((await page.$$('.scratch-cell')).length, 8, 'claimed face remains visible');
      await waitForClaimClose(page);
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchClaim').length), 1);
      await page.click('.scratch-shop-card'); await page.waitForSelector('.scratch-product');
      assert.equal(await page.$('.scratch-result'), null, 'reopening does not replay the old result');
    }
  } finally { await page.close(); }
});

test('automatic reveal animates threshold and all cells before claiming, and cancels on close', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await openShop(page, 'fallback'); await buyAndOpen(page);
    await page.evaluate(() => {
      const canvas = document.querySelector('.scratch-coating'), box = canvas.getBoundingClientRect();
      for (const y of [0.2, 0.6]) {
        canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'mouse', buttons: 1,
          clientX: box.left, clientY: box.top + box.height * y, bubbles: true }));
        canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', buttons: 1,
          clientX: box.right, clientY: box.top + box.height * y, bubbles: true }));
      }
    });
    assert.ok(await page.$('[data-scratch-region="0"] .scratch-coating'), 'threshold keeps foil for animation');
    await page.waitForSelector('[data-scratch-region="0"].is-revealed');
    assert.equal((await page.$$('.scratch-coating')).length, 7);
    await clickText(page, '.scratch-controls button', '全部刮开');
    assert.equal(await page.$eval('.scratch-controls button', (el) => el.disabled), true);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('[data-scratch-region="1"] canvas');
      if (!canvas) return false;
      const pixels = canvas.getContext('2d').getImageData(0, 0, 300, 100).data;
      const erased = pixels.filter((v, i) => i % 4 === 3 && v < 128).length / 30000;
      return erased > 0.1 && erased < 0.9;
    });
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets.length), 1,
      'no claim while foil is still animating');
    await waitForDebris(page, true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.scratch-panel'));
    await page.click('.relic-icons [data-relic-id="relic_235"]');
    await page.waitForSelector('.scratch-coating');
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1100)));
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets.length), 1,
      'cancelled animation cannot claim a closed ticket');
    assert.ok(await page.$('[data-scratch-region="0"].is-revealed'), 'completed cell persists');
    await clickText(page, '.scratch-controls button', '全部刮开');
    await page.waitForFunction(() => globalThis.__MOCK__.S().priv.scratch.tickets.length === 0);
    await waitForClaimClose(page);
    await page.click('.scratch-shop-card');
    await page.waitForSelector('.scratch-product');
    await buyAndOpen(page);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await clickText(page, '.scratch-controls button', '全部刮开');
    await page.waitForFunction(() => globalThis.__MOCK__.S().priv.scratch.tickets.length === 0);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('scratch debris: mouse flakes fall outside cells, expire, ignore erased foil and clear on close', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await openShop(page, 'fallback'); await buyAndOpen(page);
    assert.equal(await page.$eval('.scratch-debris', (el) => getComputedStyle(el).pointerEvents), 'none');
    await waitForDebris(page, false);
    const box = await (await page.$('[data-scratch-region="0"] canvas')).boundingBox();
    const stroke = async () => {
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.75);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.75, { steps: 8 });
      await page.mouse.up();
    };
    const falling = page.waitForFunction(() => {
      const canvas = document.querySelector('.scratch-debris'), bounds = canvas.getBoundingClientRect();
      const cell = document.querySelector('[data-scratch-region="0"]').getBoundingClientRect();
      const y = Math.ceil((cell.bottom - bounds.top) * canvas.height / bounds.height) + 2;
      const pixels = canvas.getContext('2d').getImageData(0, y, canvas.width, canvas.height - y).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
      return false;
    }, { timeout: 5000 });
    await stroke(); await waitForDebris(page, true); await falling;
    // Capture the current painted frame before screenshot encoding outlives the short effect.
    await page.$eval('.scratch-debris', (el) => {
      const image = new Image(); image.src = el.toDataURL(); image.className = el.className;
      image.style.pointerEvents = 'none'; el.after(image);
    });
    await page.screenshot({ path: 'test/e2e/out/scratch-debris-desktop.png' });
    await page.$eval('img.scratch-debris', (el) => el.remove());
    await waitForDebris(page, false);
    // Widen the erased strip, then scratch its empty interior away from antialiased edges.
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6, { steps: 8 });
    await page.mouse.up(); await waitForDebris(page, false);
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.675);
    await page.mouse.down(); await page.mouse.up();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.$eval('.scratch-debris', (el) => {
      const a = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      return a.some((v, i) => i % 4 === 3 && v);
    }), false, 'repeated strokes over cleared foil emit no new flakes');
    await scratchRegion(page, 0);
    await waitForDebris(page, true);
    assert.ok(await page.$('[data-scratch-region="0"].is-revealed'), 'flakes outlive the removed coating');
    await page.evaluate(() => { globalThis.__scratchDebrisCanvas = document.querySelector('.scratch-debris'); });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.scratch-panel'));
    assert.equal(await page.evaluate(() => {
      const el = globalThis.__scratchDebrisCanvas;
      return el.getContext('2d').getImageData(0, 0, el.width, el.height).data.some((v, i) => i % 4 === 3 && v);
    }), false, 'closing clears the transient layer');
    await page.click('.relic-icons [data-relic-id="relic_235"]'); await page.waitForSelector('.scratch-debris');
    await waitForDebris(page, false);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('shop ticket slot: unlock gate, stacked art, shared purchase flow, ready gate and folding', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP&render=fallback`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.shopbar__row');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = []; }));
    await page.waitForFunction(() => !document.querySelector('.scratch-shop-card'));
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.pub.round = 7; s.priv.alive = true; s.priv.ready = false; s.priv.funds = 100;
      s.priv.relics = [{ id: 'relic_234', round: 1 }];
      s.priv.scratch = { seq: 0, tickets: [], lastResult: null };
    }));
    await page.waitForSelector('.scratch-shop-card');
    assert.equal(await page.$('.scratch-shortcut'), null, 'no purchase shortcut next to the collection');
    await page.waitForFunction(() => {
      const imgs = [...document.querySelectorAll('.scratch-shop-card img')];
      return imgs.length === 5 && imgs.every((img) => img.complete && img.naturalWidth > 0);
    });
    assert.equal(await page.$eval('.scratch-shop-card', (el) => el.nextElementSibling.className), 'funds');
    assert.equal(await page.$eval('.scratch-shop-card', (el) => Math.round(el.getBoundingClientRect().height)),
      await page.$eval('.lvcard', (el) => Math.round(el.getBoundingClientRect().height)));
    await page.screenshot({ path: 'test/e2e/out/scratch-shop-slot.png' });
    const before = await page.evaluate(() => globalThis.__MOCK__.S().priv.funds);
    await page.click('.scratch-shop-card');
    await page.waitForSelector('.scratch-product');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.funds), before, 'entry does not charge funds');
    await page.click('.scratch-product');
    await page.waitForSelector('.scratch-product.is-armed');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.funds), before, 'first tap only confirms');
    await page.click('.scratch-product');
    await page.waitForSelector('.scratch-unopened');
    await page.click('.scratch-panel .modal__actions button');
    await page.click('.scratch-shop-card');
    await page.waitForSelector('.scratch-product');
    assert.equal(await page.$('.scratch-unopened'), null);
    assert.equal(await page.$('.scratch-inventory'), null);
    assert.equal(await page.$eval('.scratch-panel', (el) => /待兑奖/.test(el.textContent)), false);
    assert.equal(await page.$eval('.scratch-shop-card', (el) => el.textContent.trim()), '购买刮刮票');
    await page.click('.scratch-panel .modal__actions button');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.ready = true; }));
    // Ready folds the bar; unfolding may inspect purchases but cannot buy.
    await page.waitForSelector('.shopbar-tab__btn');
    await page.$eval('.shopbar-tab__btn', (el) => el.click());
    await page.click('.scratch-shop-card');
    await page.waitForSelector('.scratch-product:disabled');
    await page.click('.scratch-panel .modal__actions button');
    await page.$eval('.funds__collapse', (el) => el.click());
    await page.waitForFunction(() => !document.querySelector('.scratch-shop-card'));
    await page.$eval('.shopbar-tab__btn', (el) => el.click());
    await page.waitForSelector('.scratch-shop-card');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = []; }));
    await page.waitForFunction(() => !document.querySelector('.scratch-shop-card'));
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('collection ticket opens scratch face directly, while identity details have no purchase button', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1440, height: 1000 });
    await openShop(page);
    await page.click('.scratch-product');
    await page.waitForSelector('.scratch-product.is-armed');
    await page.click('.scratch-product');
    await page.waitForSelector('.scratch-unopened');
    await page.click('.scratch-panel .modal__actions button');
    await page.click('.relic-icons [data-relic-id="relic_234"]');
    await page.waitForSelector('.relic-panel');
    assert.equal(await page.$eval('.relic-panel', (el) => el.textContent.includes('购彩与刮奖')), false);
    await page.click('.relic-panel .modal__actions button');
    await page.click('.relic-icons [data-relic-id="relic_235"]');
    await page.waitForSelector('.scratch-coating');
    assert.equal(await page.$('.relic-panel'), null);
    assert.equal((await page.$$('.scratch-coating')).length, 8);
    assert.equal(await page.$eval('.scratch-coating', (el) => getComputedStyle(el).cursor), 'default');
    const regions = await page.$$eval('.scratch-winning canvas', (els) => els.map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect(); return { x, y, width, height };
    }));
    const erased = () => page.$$eval('.scratch-winning canvas', (els) => els.map((el) => {
      const pixels = el.getContext('2d').getImageData(0, 0, 300, 100).data;
      let n = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 128) n++;
      return n;
    }));
    const first = regions[0], second = regions[1], y = first.y + first.height / 2;
    await page.mouse.move(first.x + first.width / 2, y);
    assert.deepEqual(await erased(), [0, 0], 'hover alone does not erase');
    await page.mouse.move(first.x - 8, y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(first.x + first.width / 2, y, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    assert.deepEqual(await erased(), [0, 0], 'right-button entry does not erase');
    await page.mouse.move(first.x - 8, y);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2, y, { steps: 40 });
    await page.mouse.up();
    assert.ok((await erased()).every((n) => n > 0), 'dragging from outside erases both regions without repressing');
    const after = await erased();
    await page.mouse.move(second.x + second.width - 5, y + 10, { steps: 10 });
    assert.deepEqual(await erased(), after, 'release stops erasing');
    assert.equal(await page.$eval('.scratch-panel--face > .modal__body', (el) => getComputedStyle(el).scrollbarWidth), 'none');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchOpen').length), 1);
  } finally { await page.close(); }
});

test('scratch desktop: actual mouse erasure, saved progress, eight regions, one claim and reusable purchase slot', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 180000,
}, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport({ width: 1440, height: 1000 }); await openShop(page);
    await page.waitForFunction(() => [...document.querySelectorAll('.scratch-product img')].every((i) => i.complete && i.naturalWidth > 0));
    assert.equal((await page.$$('.scratch-product')).length, 5);
    const boxes = await page.$$eval('.scratch-product', (cards) => cards.map((card) => {
      const { x, y, width, height } = card.getBoundingClientRect(); return { x, y, width, height };
    }));
    assert.equal(boxes[0].y, boxes[2].y, 'three cards in the first row');
    assert.equal(boxes[3].y, boxes[4].y, 'two cards in the second row');
    assert.ok(boxes[3].y > boxes[0].y);
    await page.click('.scratch-product');
    await page.waitForSelector('.scratch-product.is-armed');
    await page.click('.scratch-product:nth-child(2)');
    assert.equal(await page.$eval('.scratch-product:first-child', (el) => el.getAttribute('aria-pressed')), 'false');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchBuy').length), 0);
    assert.equal(await page.$eval('.scratch-panel', (el) => /当前金币|谢谢参与|最多保留|查看完整奖表/.test(el.textContent)), false);
    await page.click('.scratch-panel .modal__title');
    await page.waitForFunction(() => !document.querySelector('.scratch-product.is-armed'));
    const alpha = await page.evaluate(() => [...document.querySelectorAll('.scratch-product img')].map((img) => {
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, 1, 1).data[3];
    }));
    assert.deepEqual(alpha, [0, 0, 0, 0, 0], 'real PNG alpha outside the ticket');
    await page.screenshot({ path: 'test/e2e/out/scratch-shop-desktop.png' });
    await buyAndOpen(page);
    assert.equal((await page.$$('.scratch-coating')).length, 8);
    const ticketId = await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets[0].id);
    await scratchRegion(page, 0);
    assert.equal((await page.$$('.scratch-coating')).length, 7);
    await page.screenshot({ path: 'test/e2e/out/scratch-partial-desktop.png' });
    assert.equal(await page.$('.scratch-panel--face .modal__actions'), null, 'ticket has no close button');
    assert.equal(await page.$('.scratch-panel--face .modal__head'), null, 'ticket has no outer title');
    const size = await page.$eval('.scratch-paper', (el) => el.getBoundingClientRect().width);
    const panelSize = await page.$eval('.scratch-panel', (el) => el.getBoundingClientRect().width);
    assert.ok(size > panelSize * .85, 'ticket fills the former dialog width');
    await page.mouse.click(10, 10);
    await page.waitForFunction(() => !document.querySelector('.scratch-panel'));
    await page.click('.relic-icons [data-relic-id="relic_235"]');
    await page.waitForSelector('[data-scratch-region="0"].is-revealed');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets[0].id), ticketId);
    for (let region = 1; region < 8; region++) await scratchRegion(page, region);
    await waitForClaimClose(page);
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchClaim').length), 1);
    assert.deepEqual(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets), []);
    assert.equal(await page.$('.relic-icons [data-relic-id="relic_235"]'), null, 'claimed ticket leaves the collection');
    assert.equal(await page.evaluate((id) => localStorage.getItem(`sp.scratch.${id}`), ticketId), null, 'claimed scratch data is removed');
    await page.click('.scratch-shop-card');
    await page.waitForSelector('.scratch-product');
    await page.click('.scratch-product');
    await page.waitForSelector('.scratch-product.is-armed');
    await page.click('.scratch-product'); await page.waitForSelector('.scratch-unopened');
    assert.notEqual(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets[0].id), ticketId);
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
    assert.ok(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem(`sp.scratch.${globalThis.__MOCK__.S().priv.scratch.tickets[0].id}`))).length > 0));
    await waitForDebris(page, false);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    const next = await (await page.$('[data-scratch-region="1"] canvas')).boundingBox();
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: next.x + 10, y: next.y + next.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: next.x + next.width * 0.7, y: next.y + next.height / 2 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitForDebris(page, true);
    await page.screenshot({ path: 'test/e2e/out/scratch-debris-mobile.png' });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await waitForDebris(page, false);
    const saved = await page.evaluate(() => ({ priv: structuredClone(globalThis.__MOCK__.S().priv), secret: structuredClone(globalThis.__MOCK__.S().scratchSecret) }));
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.relic-icons__heading');
    await page.evaluate((saved) => globalThis.__MOCK__.mutate((s) => { s.pub.round = 7; s.priv = saved.priv; s.scratchSecret = saved.secret; }), saved);
    await page.click('.relic-icons [data-relic-id="relic_235"]'); await page.waitForSelector('.scratch-coating');
    const coverage = await page.$eval('[data-scratch-region="0"] canvas', (e) => {
      const a = e.getContext('2d').getImageData(0, 0, 300, 100).data; let n = 0; for (let i = 3; i < a.length; i += 4) if (a[i] < 128) n++; return n;
    });
    assert.ok(coverage > 0, 'partial touch scratches survive reload');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.ready = true; }));
    await page.waitForSelector('.scratch-controls button:disabled');
    await page.evaluate(async () => {
      const { initLang, switchLang } = await import('/js/ui/lang.js'); await initLang(); await switchLang('en');
      globalThis.__MOCK__.mutate((s) => { s.priv.ready = false; });
    });
    await page.waitForSelector('.relic-icons [data-relic-id="relic_235"]');
    await page.evaluate(() => {
      if (!document.querySelector('.scratch-panel')) document.querySelector('.relic-icons [data-relic-id="relic_235"]').click();
    });
    await page.waitForFunction(() => document.querySelector('.scratch-panel')?.textContent.includes('Winning symbols'));
    await page.screenshot({ path: 'test/e2e/out/scratch-mobile.png' });
    assert.equal(await page.$eval('.scratch-panel', (e) => e.getBoundingClientRect().right <= innerWidth), true);
    await page.focus('.scratch-controls button'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('.scratch-panel'));
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.scratchClaim').length), 1);
  } finally { await page.close(); }
});


test('multiple tickets: buy while holding, claim independently; one combined Ready prompt cancels or keeps best', {
  skip: !ENABLED && 'set SP_E2E=1 and provide Chrome', timeout: 60000,
}, async () => {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await openShop(page);
    for (const tier of [1, 5, 1]) {
      if (await page.$('.scratch-unopened')) {
        await page.click('.scratch-panel .modal__actions button');
        await page.click('.scratch-shop-card');
      }
      await page.waitForSelector('.scratch-product');
      const selector = '.scratch-product:nth-child(' + tier + ')';
      await page.click(selector); await page.waitForSelector(selector + '.is-armed'); await page.click(selector);
      await page.waitForSelector('.scratch-unopened');
    }
    const tickets = await page.evaluate(() => structuredClone(globalThis.__MOCK__.S().priv.scratch.tickets));
    assert.equal(tickets.length, 3);
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.funds), 86);
    assert.equal(await page.$('.scratch-inventory'), null);
    await clickText(page, '.scratch-unopened button', '开始刮奖');
    await page.waitForSelector('.scratch-coating');
    await clickText(page, '.scratch-controls button', '全部刮开');
    await page.waitForFunction(() => globalThis.__MOCK__.S().priv.scratch.tickets.length === 2);
    assert.ok(await page.$('.relic-icons [data-relic-id="relic_235"]'), 'another ticket of the same tier remains');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.scratch-panel'));
    await page.click('.readybtn');
    await page.waitForSelector('.modal__text');
    assert.equal((await page.$$('[role=dialog]')).length, 1);
    const text = await page.$eval('.modal__text', (el) => el.textContent);
    assert.match(text, /资金未使用/); assert.match(text, /2 张刮刮票/); assert.match(text, /其余将销毁/);
    await clickText(page, '.modal__actions button', '继续整备');
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets.length), 2);
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.ready), false);
    await page.click('.readybtn'); await page.waitForSelector('.modal__text');
    await clickText(page, '.modal__actions button', '准备就绪');
    await page.waitForFunction(() => globalThis.__MOCK__.S().priv.ready);
    assert.deepEqual(await page.evaluate(() => globalThis.__MOCK__.S().priv.scratch.tickets.map((t) => t.id)), [tickets[1].id]);
    await page.click('.readybtn');
    await page.waitForFunction(() => !globalThis.__MOCK__.S().priv.ready);
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.funds = 0; }));
    await page.click('.readybtn'); await page.waitForSelector('.modal__text');
    const single = await page.$eval('.modal__text', (el) => el.textContent);
    assert.match(single, /1 张刮刮票/); assert.doesNotMatch(single, /剩余资金将清零/);
    await page.screenshot({ path: 'test/e2e/out/scratch-ready-warning.png' });
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
