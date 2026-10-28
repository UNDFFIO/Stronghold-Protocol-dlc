// Actual collection UI, including scroll reachability, spectator ownership and settlement retention.
// Opt in: SP_E2E=1 node --test test/ui/relics.e2e.test.js (CHROME_PATH optionally overrides the system browser).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(existsSync);
const ENABLED = process.env.SP_E2E === '1' && CHROME;
const OUT = fileURLToPath(new URL('../e2e/out/', import.meta.url));
let srv, browser, base;
before(async () => {
  if (!ENABLED) return;
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${srv.port}`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, args: ['--no-sandbox', '--disable-gpu'] });
  mkdirSync(OUT, { recursive: true });
});
after(async () => { await browser?.close(); await srv?.close(); });

async function closed(page) {
  await page.waitForSelector('.relic-panel', { hidden: true });
}

test('four new official curses: collection, journal-ready copy and transparent PNG decoding', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    const ids = ['relic_227', 'relic_228', 'relic_219', 'relic_220'];
    await page.evaluate((ids) => globalThis.__MOCK__.mutate((s) => {
      s.priv.relics = ids.map((id) => ({ id, round: 2 }));
    }), ids);
    await page.waitForFunction((ids) => ids.every((id) => {
      const img = document.querySelector(`.effect--relic[data-relic-id="${id}"] img`);
      return img?.complete && img.naturalWidth > 0;
    }), {}, ids);
    await page.$eval('.relic-icons__heading', (el) => el.click());
    await page.waitForSelector('.relic-panel');
    const text = await page.$eval('.relic-panel', (el) => el.textContent);
    // The public roster controls the global curse; this fixture exercises the plain catalogue copy first.
    for (const name of ['无垠赠礼', '路网', '追忆仪', '“小磨唧”']) assert.ok(text.includes(name));
    assert.match(text, /负面/); assert.match(text, /50%/); assert.match(text, /20层/); assert.match(text, /7件/);
    for (const selector of ['.tbanner', '.mpop--phase', '.pbanner--overlay']) await page.waitForSelector(selector, { hidden: true });
    await page.screenshot({ path: `${OUT}/official-four-new-curses.png` });
    for (const id of ids) {
      const decoded = await page.evaluate(async (id) => {
        const response = await fetch(`/assets/relics/${id}.png`);
        const bitmap = await createImageBitmap(await response.blob());
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return { status: response.status, width: canvas.width, alpha: [...rgba].some((v, i) => i % 4 === 3 && v === 0) };
      }, id);
      assert.equal(decoded.status, 200); assert.ok(decoded.width > 0); assert.equal(decoded.alpha, true);
    }
  } finally { await page.close(); }
});

test('boundless gift: teammate-owned global reversal, dynamic DOM/attributes/Pixi, digit-mask composition and full restoration', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate(async () => {
      const label = document.createElement('div'); label.id = 'gift-label'; label.textContent = '金币123'; label.title = '金币123'; document.body.append(label);
      const input = document.createElement('input'); input.id = 'gift-input'; input.value = '书写名字123'; document.body.append(input);
      const { installPixiNumberMask } = await import('/js/ui/numberMask.js');
      class Text { constructor() { this._text = '金币123'; } updateText() { this.rendered = this._text; } }
      installPixiNumberMask({ Text }); globalThis.__giftText = new Text(); globalThis.__giftText.updateText();
      globalThis.__MOCK__.mutate((s) => { s.pub.players[1].relics = [{ id: 'relic_227', round: 1 }]; });
    });
    await page.waitForFunction(() => document.querySelector('#gift-label').textContent === '321币金');
    assert.deepEqual(await page.evaluate(() => [document.querySelector('#gift-label').title, document.querySelector('#gift-input').value,
      globalThis.__giftText.rendered, globalThis.__giftText._text]), ['321币金', '书写名字123', '321币金', '金币123']);
    await page.evaluate(() => {
      document.querySelector('#gift-label').firstChild.nodeValue = '准备45';
      document.querySelector('#gift-label').title = '准备45';
      globalThis.__MOCK__.mutate((s) => { s.priv.relics = [{ id: 'relic_159', round: 1 }]; });
    });
    await page.waitForFunction(() => document.querySelector('#gift-label').textContent === '54备准' && document.querySelector('#gift-label').title === '■■备准');
    await page.screenshot({ path: `${OUT}/boundless-gift-reversed.png` });
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.pub.players[1].relics = []; s.priv.relics = []; }));
    await page.waitForFunction(() => document.querySelector('#gift-label').textContent === '准备45' && document.querySelector('#gift-label').title === '准备45');
    assert.deepEqual(await page.evaluate(() => [globalThis.__giftText.rendered, globalThis.__giftText._text]), ['金币123', '金币123']);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('四件官方负面藏品：名称效果、红色品质与官方PNG实际解码', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    const ids = ['relic_177', 'relic_181', 'relic_185', 'relic_187'];
    await page.evaluate((ids) => globalThis.__MOCK__.mutate((s) => {
      s.priv.relics = ids.map((id) => ({ id, round: 2 }));
    }), ids);
    for (const id of ids) {
      const selector = `.effect--relic[data-relic-id="${id}"]`;
      await page.waitForFunction((selector) => {
        const img = document.querySelector(`${selector} img`);
        return img?.complete && img.naturalWidth > 0;
      }, {}, selector);
    }
    await page.$eval('.relic-icons__heading', (el) => el.click());
    await page.waitForSelector('.relic-panel');
    const text = await page.$eval('.relic-panel', (el) => el.textContent);
    for (const name of ['乌萨斯弯刀', '莱塔尼亚权杖', '半洗孤钻', '酒神的印记']) assert.ok(text.includes(name));
    assert.match(text, /负面/); assert.match(text, /金币数量-50%/); assert.match(text, /可同时部署人数-1/);
    assert.match(text, /最多降至1/);
    for (const selector of ['.tbanner', '.mpop--phase', '.pbanner--overlay']) await page.waitForSelector(selector, { hidden: true });
    await page.screenshot({ path: `${OUT}/official-negative-relics.png` });
    for (const id of ids) assert.equal((await page.goto(`${base}/assets/relics/${id}.png`)).status(), 200);
  } finally { await page.close(); }
});

test('负面死亡笔记：收藏栏与详情显示负面品质并解码复用图标', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.relics = [{ id: 'relic_241', round: 2 }, { id: 'relic_242', round: 3 }];
    }));
    const selector = '.effect--relic[data-relic-id="relic_242"]';
    await page.waitForFunction((selector) => {
      const img = document.querySelector(`${selector} img`);
      return img?.complete && img.naturalWidth > 0;
    }, {}, selector);
    assert.ok(await page.$('.effect--relic[data-relic-id="relic_241"]'));
    await page.$eval(selector, (el) => el.click());
    await page.waitForSelector('.relic-panel');
    const text = await page.$eval('.relic-panel', (el) => el.textContent);
    assert.match(text, /死亡笔记/); assert.match(text, /负面/);
    assert.match(text, /本场战斗无法复活/);
    const response = await page.goto(`${base}/assets/relics/relic_242.png`);
    assert.equal(response.status(), 200);
  } finally { await page.close(); }
});

test('热水壶：重复补位卡片更新后仍可选择最后一项', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate(() => {
      globalThis.__MOCK__.setPhase('SETTLE');
      globalThis.__MOCK__.mutate((s) => {
        s.priv.relics = [];
        s.priv.relicOffer = { id: 'ui:kettles', round: 4, reason: 'lowLoss', options: ['relic_003', 'relic_014', 'relic_014'] };
        s.pub.relicChoosing = true; s.pub.deadline = 0;
      });
    });
    await page.waitForFunction(() => document.querySelectorAll('.relic-choice__card').length === 3);
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.relicOffer.options = Array(4).fill('relic_014');
    }));
    await page.waitForFunction(() => document.querySelectorAll('.relic-choice__card[data-relic-id="relic_014"]').length === 4);
    await page.waitForFunction(() => [...document.querySelectorAll('.relic-choice__card img')].every((img) => img.complete && img.naturalWidth > 0));
    await page.click('.relic-choice__card:nth-child(4)');
    await page.waitForSelector('.relic-choice', { hidden: true });
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.relics.at(-1).id), 'relic_014');
  } finally { await page.close(); }
});

test('死亡笔记窗口：桌面放大，缩小界面、特大字号与短横屏仍完整显示图案、按钮和页脚', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    for (const selector of ['.tbanner', '.mpop--phase', '.pbanner--overlay']) await page.waitForSelector(selector, { hidden: true });
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.relics = [{ id: 'relic_241', round: 3 }]; s.priv.funds = 16; s.priv.ready = false;
      s.priv.deathNote = { used: false };
    }));
    await page.click('.effect--relic[data-relic-id="relic_241"]');
    await page.waitForSelector('.death-note input:not(:disabled)');
    await page.type('.death-note input', 'enemy');
    await page.mouse.move(0, 0);
    const cases = [
      [1920, 1080, 100, 'sm'], [1920, 900, 75, 'sm'], [1366, 768, 75, 'sm'],
      [1366, 768, 100, 'xl'], [1280, 720, 100, 'md'], [844, 390, 100, 'sm'],
      [640, 360, 75, 'sm'], [390, 844, 75, 'sm'], [320, 568, 100, 'xl'],
    ];
    for (const [width, height, ui, textSize] of cases) {
      await page.setViewport({ width, height });
      await page.evaluate(async ({ ui, textSize }) => {
        const { updateSettings } = await import('/js/ui/settings.js');
        const { updateFit } = await import('/js/ui/screenFit.js');
        updateSettings({ textSize }); updateFit({ ui });
      }, { ui, textSize });
      await page.waitForFunction(() => document.querySelector('.death-note-panel').getAnimations().every((a) => a.playState === 'finished'));
      const layout = await page.$eval('.death-note-panel', (el) => {
        const box = el.getBoundingClientRect(), body = el.querySelector('.modal__body');
        const inside = (r) => r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
        const clipped = [...el.querySelectorAll('.death-note-book, .death-note-book__edition, h2, .death-note-eyes__art, .death-note-eyes__name, .death-note-eyes__pact small, .death-note-book__folio, .death-note-book__cost, input, button')]
          .filter((node) => !inside(node.getBoundingClientRect())).map((node) => node.className?.baseVal ?? node.className ?? node.tagName);
        const blocked = [...el.querySelectorAll('input, button')].filter((node) => {
          const r = node.getBoundingClientRect();
          return !node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }).map((node) => node.className || node.tagName);
        return { width: box.width, height: box.height, inViewport: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
          overflowX: body.scrollWidth - body.clientWidth, overflowY: body.scrollHeight - body.clientHeight, clipped, blocked };
      });
      const context = `${width}×${height}, ui=${ui}, text=${textSize}: ${JSON.stringify(layout)}`;
      assert.equal(layout.inViewport, true, context);
      assert.ok(layout.overflowX <= 1 && layout.overflowY <= 1, context);
      assert.deepEqual(layout.clipped, [], context); assert.deepEqual(layout.blocked, [], context);
      if (width === 1920) assert.ok(layout.width >= 1200 && layout.height >= 780, context);
      if ((width === 1920 && height === 900) || width === 640) {
        await page.screenshot({ path: `${OUT}/death-note-window-${width}x${height}.png` });
      }
    }
  } catch (error) {
    await page.screenshot({ path: `${OUT}/death-note-window-error.png` }); throw error;
  } finally { await page.close(); }
});

test('死亡笔记：图标直达独立笔记本，桌面手机可书写、关闭、从列表打开，隐藏敌名可恢复', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 180000,
}, async () => {
  for (const [width, height] of [[1920, 1080], [390, 844]]) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height });
      await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.relic-icons__heading');
      await page.waitForSelector('.tbanner', { hidden: true });
      await page.waitForSelector('.mpop--phase', { hidden: true });
      await page.waitForSelector('.pbanner--overlay', { hidden: true });
      const enemyName = await page.evaluate(async () => {
        const { data } = await import('/js/data.js');
        const name = data.list('enemies').find((r) => r.name).name;
        const line = document.createElement('div'); line.id = 'death-note-probe'; line.title = name;
        line.textContent = `${name} ×12`; document.body.append(line);
        globalThis.__MOCK__.mutate((s) => {
          s.priv.relics = [{ id: 'relic_241', round: 3 }]; s.priv.funds = 16; s.priv.ready = false;
          s.priv.deathNote = { used: false };
        });
        return name;
      });
      await page.waitForFunction((name) => !document.querySelector('#death-note-probe').textContent.includes(name), {}, enemyName);
      assert.match(await page.$eval('#death-note-probe', (el) => el.textContent), /■.*×12/);
      assert.ok(!await page.$eval('#death-note-probe', (el) => /[^■]/.test(el.title)));
      await page.waitForFunction(() => [...document.querySelectorAll('.effect--relic img')]
        .some((img) => img.src.includes('relic_241.png') && img.complete && img.naturalWidth > 0));
      const alpha = await page.$eval('.effect--relic img', (img) => {
        const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, 1, 1).data[3];
      });
      assert.equal(alpha, 0);
      await page.click('.effect--relic[data-relic-id="relic_241"]');
      await page.waitForSelector('.death-note input:not(:disabled)');
      assert.equal(await page.$('.relic-panel'), null, 'icon opens the book directly');
      const info = await page.$eval('.death-note-panel', (el) => {
        const r = el.getBoundingClientRect();
        const body = el.querySelector('.modal__body');
        return { text: el.textContent, x: r.x, right: r.right, overflow: body.scrollWidth - body.clientWidth };
      });
      assert.ok(info.x >= 0 && info.right <= width);
      assert.ok(info.overflow <= 1, 'both book pages fit without horizontal scrolling');
      assert.match(info.text, /死亡笔记/);
      assert.doesNotMatch(info.text, /传说|准备阶段可花费/);
      assert.equal(await page.$eval('.death-note button', (el) => el.textContent.trim()), '书写名字');
      const layout = await page.$eval('.death-note-book', (el) => {
        const rect = (selector) => el.querySelector(selector).getBoundingClientRect();
        const english = rect('.death-note-book__edition'), chinese = rect('h2');
        const cost = rect('.death-note-book__cost'), page = rect('.death-note-book__page--right');
        return { subtitleBelow: chinese.top >= english.bottom && chinese.top - english.bottom <= 20,
          costBottomRight: cost.right <= page.right && cost.right > page.right - 60 && cost.bottom > page.bottom - 35,
          cost: el.querySelector('.death-note-book__cost').textContent };
      });
      assert.equal(layout.subtitleBelow, true);
      assert.equal(layout.costBottomRight, true);
      assert.equal(layout.cost, '8金币');
      assert.doesNotMatch(info.text, /敌名遮蔽|黑色方块/);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.death-note-panel', { hidden: true });
      const headingHit = await page.$eval('.relic-icons__heading', (el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      assert.equal(headingHit, true, 'collection heading remains reachable beside the direct writing icon');
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel', { timeout: 5000 });
      assert.equal(await page.$('.relic-panel .death-note input'), null);
      await page.click('.relic-card:has(.relic-card__name) button');
      await page.waitForSelector('.death-note-panel');
      assert.equal(await page.$('.relic-panel'), null, 'list shortcut replaces the list');
      await page.mouse.move(0, 0);
      await page.waitForFunction(() => !document.querySelector('.tooltip.is-shown'));
      await page.screenshot({ path: `${OUT}/death-note-book-${width}.png` });
      await (await page.$('.death-note-panel')).screenshot({ path: `${OUT}/death-note-book-detail-${width}.png` });
      await page.type('.death-note input', enemyName);
      assert.equal(await page.$eval('.death-note input', (el) => el.value), enemyName);
      await page.click('.death-note button');
      await page.waitForFunction(() => globalThis.__MOCK__.S().priv.deathNote.used);
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.funds), 8);
      const request = await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.deathNote'));
      assert.equal(request.length, 1); assert.equal(request[0][1].name, enemyName);
      await page.waitForFunction(() => document.querySelector('.death-note button').disabled);
      assert.equal(await page.$eval('.death-note input', (el) => el.value), enemyName, 'written name remains on the page');
      const box = await page.$eval('.death-note', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right }; });
      assert.ok(box.x >= 0 && box.right <= width);
      await page.waitForSelector('.mpop--phase', { hidden: true });
      await page.screenshot({ path: `${OUT}/death-note-${width}.png` });
      await page.click('.death-note-book__close');
      await page.waitForSelector('.death-note-panel', { hidden: true });
      await page.click('.effect--relic[data-relic-id="relic_241"]');
      await page.waitForSelector('.death-note input:disabled');
      assert.match(await page.$eval('.death-note button', (el) => el.textContent), /本回合已书写/);
      const beforeEyes = await page.evaluate(() => globalThis.__MOCK__.S().priv.lp);
      await page.click('.death-note-eyes__pact');
      await page.waitForFunction(() => globalThis.__MOCK__.S().priv.shinigamiEyes);
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.lp), Math.ceil(beforeEyes / 2));
      assert.equal(await page.$eval('.death-note-eyes__pact', (el) => el.disabled), true);
      assert.equal(await page.$eval('.death-note-book__cost', (el) => el.textContent), '4金币');
      assert.equal(await page.$eval('.death-note button', (el) => el.disabled), true, 'trade does not grant a second writing');
      await page.waitForFunction((name) => document.querySelector('#death-note-probe').textContent === `${name} ×12`, {}, enemyName);
      const lp = await page.evaluate(() => ({
        own: [...document.querySelectorAll('.gtop__half--r .lp__val, .team__row.is-self .lp__val')].map((el) => el.textContent),
        other: [...document.querySelectorAll('.team__row:not(.is-self) .lp__val')].map((el) => el.textContent),
        titles: [...document.querySelectorAll('.gtop__half--r .lp, .team__row.is-self .lp')].map((el) => el.title),
      }));
      assert.deepEqual(lp.own, ['■■', '■■']);
      assert.ok(lp.other.every((text) => /^\d+$/.test(text)));
      assert.ok(lp.titles.every((text) => text === '死神之眼：生命值不可见'));
      await (await page.$('.death-note-panel')).screenshot({ path: `${OUT}/death-note-eyes-active-${width}.png` });
      await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.pub.round++; s.priv.deathNote.used = false; }));
      await page.waitForSelector('.death-note input:not(:disabled)');
      await page.type('.death-note input', enemyName);
      await page.click('.death-note button');
      await page.waitForFunction(() => globalThis.__MOCK__.S().priv.deathNote.used);
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.funds), 4, 'next round writing costs 4 coins');
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.shinigamiEyes').length), 1);
      await page.mouse.click(4, 4);
      await page.waitForSelector('.death-note-panel', { hidden: true });
      const pixi = await page.evaluate(async (name) => {
        const { installPixiNumberMask } = await import('/js/ui/numberMask.js');
        class Text { updateText() { this.rendered = this._text; } }
        installPixiNumberMask({ Text });
        const text = new Text(); text._text = `${name} ×12`; text.updateText();
        const namesOnly = text.rendered;
        globalThis.__MOCK__.mutate((s) => { s.priv.relics.push({ id: 'relic_159', round: 1 }); });
        text.updateText();
        const combined = text.rendered;
        globalThis.__MOCK__.mutate((s) => { s.priv.relics = []; });
        text.updateText();
        return { namesOnly, combined, restored: text.rendered, raw: text._text };
      }, enemyName);
      assert.equal(pixi.namesOnly, `${enemyName} ×12`, 'the pact reveals Pixi enemy names too');
      assert.ok(pixi.combined.startsWith(enemyName)); assert.match(pixi.combined, /×■■/); assert.equal(pixi.raw, `${enemyName} ×12`);
      assert.equal(pixi.restored, pixi.raw);
      await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = []; }));
      await page.waitForFunction((name) => document.querySelector('#death-note-probe').textContent === `${name} ×12`, {}, enemyName);
      assert.equal(await page.$eval('#death-note-probe', (el) => el.title), enemyName);
      await page.evaluate(async () => {
        const { h, render } = await import('/vendor/preact.module.js');
        const { FinalAssaultPlate } = await import('/js/ui/bossPlates.js');
        const root = document.createElement('div'); root.id = 'death-note-boss-intro'; document.body.append(root);
        render(h(FinalAssaultPlate, { myId: 'self', hideSelfLp: true, total: 24,
          rows: [{ player: { playerId: 'self', name: 'self' }, lp: 13 }, { player: { playerId: 'ally', name: 'ally' }, lp: 11 }] }), root);
      });
      await page.waitForSelector('#death-note-boss-intro .fa__lp');
      assert.deepEqual(await page.$$eval('#death-note-boss-intro .fa__lp', (els) => els.map((el) => el.textContent)), ['■■', '11']);
      assert.equal(await page.$eval('#death-note-boss-intro .fa__total', (el) => el.textContent), '■■');
      await page.evaluate(async () => {
        const { render } = await import('/vendor/preact.module.js');
        const root = document.getElementById('death-note-boss-intro'); render(null, root); root.remove();
      });
      await page.evaluate(async () => {
        const eyes = globalThis.__MOCK__.S().priv.shinigamiEyes;
        globalThis.__MOCK__.setPhase('RESULT'); // Mock phase changes start a fresh fixture; emulate the real result flag.
        const { store } = await import('/js/store.js');
        const state = store.get(), result = state.match.result;
        store.patch('match', { result: { ...result, players: result.players.map((p) => p.playerId === state.me.playerId ? { ...p, shinigamiEyes: eyes } : p) } });
      });
      await page.waitForSelector('.settle__next');
      await page.click('.settle__next');
      await page.waitForSelector('.steam__detail');
      await page.click('.steam__detail');
      await page.waitForSelector('.rcard.is-self .lp__val');
      assert.equal(await page.$eval('.rcard.is-self .lp__val', (el) => el.textContent), '■■');
      assert.ok((await page.$$eval('.rcard:not(.is-self) .lp__val', (els) => els.map((el) => el.textContent))).every((text) => /^\d+$/.test(text)));
    } catch (error) {
      await page.screenshot({ path: `${OUT}/death-note-error-${width}.png` });
      throw error;
    } finally { await page.close(); }
  }
});

test('四叶草化石：桌面与手机展示四选一，第四项可领取', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  for (const [width, height] of [[1920, 1080], [390, 844], [844, 390]]) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height });
      await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.relic-icons__heading');
      await page.evaluate(() => {
        globalThis.__MOCK__.setPhase('SETTLE');
        globalThis.__MOCK__.mutate((s) => {
          s.priv.relics = [{ id: 'relic_195', round: 1 }];
          s.priv.relicOffer = { id: 'ui:four', round: 2, reason: 'lowLoss', options: ['relic_001', 'relic_002', 'relic_003', 'relic_004'] };
          s.pub.relicChoosing = true; s.pub.deadline = 0;
        });
      });
      await page.waitForSelector('.relic-choice__cards--four');
      assert.match(await page.$eval('.relic-choice', (el) => el.textContent), /藏品四选一/);
      assert.equal((await page.$$('.relic-choice__card')).length, 4);
      if (width === 1920) {
        const fourWidth = await page.$eval('.relic-choice__card', (el) => el.getBoundingClientRect().width);
        await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
          s.priv.relicOffer.options = ['relic_001', 'relic_002', 'relic_003'];
        }));
        await page.waitForFunction(() => document.querySelectorAll('.relic-choice__card').length === 3);
        const threeWidth = await page.$eval('.relic-choice__card', (el) => el.getBoundingClientRect().width);
        assert.ok(fourWidth >= threeWidth * .95, `four-choice card ${fourWidth} preserves three-choice width ${threeWidth}`);
        await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
          s.priv.relicOffer.options = ['relic_001', 'relic_002', 'relic_003', 'relic_004'];
        }));
        await page.waitForSelector('.relic-choice__cards--four');
      }
      const card = await page.$('.relic-choice__card:last-child');
      await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}: fourth card fits`);
      await card.click();
      await page.waitForFunction(() => !document.querySelector('.relic-choice'));
      assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.relics.at(-1).id), 'relic_004');
    } finally { await page.close(); }
  }
});

test('护愈之手：收藏栏显示官方图标、史诗档位与完整效果', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 180000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = [{ id: 'relic_172', round: 7 }]; }));
    await page.click('.relic-icons__heading');
    await page.waitForFunction(() => [...document.querySelectorAll('.relic-panel img')]
      .some((img) => img.src.includes('relic_172.png') && img.complete && img.naturalWidth > 0));
    const text = await page.$eval('.relic-panel', (e) => e.textContent);
    assert.match(text, /护愈之手/);
    assert.match(text, /史诗/);
    assert.match(text, /免疫异常状态/);
    assert.match(text, /100%/);
  } finally { await page.close(); }
});

test('时光之末：自己的列表按钮复活队友、显示已使用，观战列表保持只读', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 180000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    const targetId = await page.evaluate(() => {
      let targetId;
      globalThis.__MOCK__.mutate((s) => {
        s.priv.relics = [{ id: 'relic_233', round: 7 }];
        s.priv.relicChessQueue = ['test_1', 'test_2'];
        const target = s.pub.players.find((p) => p.playerId !== s.priv.playerId);
        targetId = target.playerId;
        target.alive = false; target.canRevive = true; target.lp = 0; target.name = '待救队友';
      });
      return targetId;
    });
    await page.click('.relic-icons__heading');
    await page.waitForSelector('.relic-card__revive button');
    assert.equal(await page.$eval('.relic-card__revive button', (e) => e.disabled), false);
    assert.match(await page.$eval('.relic-panel', (e) => e.textContent), /2 名等待整备区空位/);
    await page.waitForSelector('.pbanner--overlay', { hidden: true });
    await page.screenshot({ path: `${OUT}/relic-time-end-revive.png` });
    await page.click('.relic-card__revive button');
    await page.waitForFunction(() => document.querySelector('.relic-card__used')?.textContent.includes('复活机会已消耗'));
    const result = await page.evaluate((id) => ({
      requests: globalThis.__MOCK__.S().requests.filter(([t]) => t === 'g.relicRevive'),
      target: globalThis.__MOCK__.S().pub.players.find((p) => p.playerId === id),
    }), targetId);
    assert.deepEqual(result.requests, [['g.relicRevive', { relicId: 'relic_233', playerId: targetId }]]);
    assert.equal(result.target.alive, true); assert.equal(result.target.lp, 11);
    assert.equal(await page.$('.relic-card__revive button'), null);
    await closeWithEscape(page);
    await page.evaluate((id) => {
      globalThis.__MOCK__.mutate((s) => { s.pub.players.find((p) => p.playerId === id).relics = [{ id: 'relic_233', round: 7 }]; });
    }, targetId);
    await page.click('.team__row:not(.is-self) .team__btn');
    await page.waitForSelector('.gm__watching');
    await page.click('.relic-icons__heading');
    await page.waitForSelector('.relic-card__used');
    assert.match(await page.$eval('.relic-card__used', (e) => e.textContent), /未使用/);
    assert.equal(await page.$('.relic-card__revive button'), null);
    await closeWithEscape(page);
    // 被淘汰的本人在当前整备阶段获救，自动回到自己的阵地。
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.alive = false;
      s.pub.players.find((p) => p.playerId === s.priv.playerId).alive = false;
    }));
    await page.waitForSelector('.gm__dead');
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => {
      s.priv.alive = true; s.priv.lp = 11;
      s.pub.players.find((p) => p.playerId === s.priv.playerId).alive = true;
    }));
    await page.waitForSelector('.gm__watching', { hidden: true });
    await page.waitForSelector('.gm__dead', { hidden: true });
  } finally { await page.close(); }
});

for (const item of [
  { id: 'relic_116', name: '“撕咬的渴望”', tier: '普通', phrases: ['击倒敌人时', '+100', '2秒'], shot: 'biting-desire' },
  { id: 'relic_117', name: '异香角', tier: '普通', phrases: ['击倒敌人时', '2点技力'], shot: 'fragrant-horn' },
  { id: 'relic_118', name: '渴血钳兽', tier: '普通', phrases: ['击倒敌人时', '10%'], shot: 'bloodthirsty-pincer' },
  { id: 'relic_119', name: '“庇护”', tier: '普通', phrases: ['高台干员', '部署时', '100%', '屏障'], shot: 'shelter' },
  { id: 'relic_132', name: '天师锦囊', tier: '普通', phrases: ['首次部署', '炎佑', '激活炎盟约'], shot: 'sachet' },
  { id: 'relic_133', name: '冰中火', tier: '普通', phrases: ['元素损伤', '元素伤害', '+75%'], shot: 'ice-fire' },
  { id: 'relic_195', name: '四叶草化石', tier: '精良', phrases: ['战斗后掉落收藏品时', '增加一个可选项'], shot: 'clover-fossil' },
  { id: 'relic_134', name: '河谷祭祈', tier: '史诗', phrases: ['凋亡', '灼燃', '神经', '侵蚀', '爆发效果增强'], shot: 'river-prayer' },
  { id: 'relic_240', name: '淬毒匕首', tier: '稀有', phrases: ['110%', '防御结算前', '5次', '每秒1次', '独立叠加'], shot: 'poison-dagger' },
  { id: 'relic_139', name: '黄金平原', tier: '稀有', phrases: ['技能结束时', '2点技力'], shot: 'golden-plains' },
  { id: 'relic_014', name: '热水壶', tier: '普通', phrases: ['获得时', '2点目标生命值'], shot: 'kettle' },
  { id: 'relic_140', name: '第一法则', tier: '史诗', phrases: ['技能结束时', '4点技力'], shot: 'first-law' },
  { id: 'relic_125', name: '液体化肥', tier: '精良', phrases: ['50点生命', '100点屏障', '140%'], shot: 'fertilizer' },
  { id: 'relic_126', name: '热辣可可', tier: '稀有', phrases: ['30%', '+150%', '最大加成'], shot: 'cocoa' },
  { id: 'relic_127', name: '止痛片', tier: '精良', phrases: ['30%', '+2/秒', '自然回复'], shot: 'painkillers' },
  { id: 'relic_172', name: '护愈之手', tier: '史诗', phrases: ['免疫异常状态', '等量屏障', '100%'], shot: 'healing-hand' },
  { id: 'relic_233', name: '“时光之末”', tier: '史诗', phrases: ['11点', '4名', '死亡时自动复活', '保留原有干员'], shot: 'time-end' },
  { id: 'relic_158', name: '时间机器', tier: '普通', phrases: ['目标生命值', '等量增加', '仅生效一场'], shot: 'time-machine' },
  { id: 'relic_159', name: '木棍', tier: '精良', phrases: ['2资金'], hiddenPhrases: ['数字', '■', '仅影响显示'], shot: 'stick' },
  { id: 'relic_156', name: '解压玩具', phrases: ['向下取整', '首领波次不生效', '10%', '未持有者各保留1个', '替代减半效果'], shot: 'toy' },
  { id: 'relic_157', name: '鸭梨手机', phrases: ['全队累计难度-1级', '单人模式-2级', '最低为0', '下一场战斗', '多名玩家获得时可叠加'], shot: 'phone' },
]) test(`${item.name}：三选一名称、稀有度、说明及透明图片可用，领取后收藏栏展示`, {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate((id) => {
      globalThis.__MOCK__.setPhase('SETTLE');
      globalThis.__MOCK__.mutate((s) => {
        s.priv.relics = [];
        s.priv.relicOffer = { id: 'ui:custom', round: 4, reason: 'perfect', options: [id, 'relic_154', 'relic_155'] };
        s.pub.relicChoosing = true; s.pub.deadline = 0;
      });
    }, item.id);
    await page.waitForSelector('.relic-choice__card');
    const text = await page.$eval('.relic-choice__card', (e) => e.textContent);
    for (const phrase of [item.name, item.tier || '稀有', ...item.phrases]) assert.ok(text.includes(phrase), phrase);
    const label = await page.$eval('.relic-choice__card', (e) => e.getAttribute('aria-label'));
    for (const phrase of item.hiddenPhrases || []) {
      assert.ok(!text.includes(phrase), `领取前正文不透露：${phrase}`);
      assert.ok(!label.includes(phrase), `领取前无障碍标签不透露：${phrase}`);
    }
    await page.waitForFunction(() => {
      const img = document.querySelector('.relic-choice__card img');
      return img?.complete && img.naturalWidth > 0;
    });
    const alpha = await page.$eval('.relic-choice__card img', (img) => {
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = false, opaque = false;
      for (let i = 3; i < data.length; i += 4) { if (!data[i]) transparent = true; if (data[i] === 255) opaque = true; }
      return { transparent, opaque };
    });
    assert.deepEqual(alpha, { transparent: true, opaque: true });
    await page.screenshot({ path: `${OUT}/relic-${item.shot}-choice.png` });
    await page.click('.relic-choice__card');
    await page.waitForFunction(() => !document.querySelector('.relic-choice'));
    assert.equal(await page.evaluate(() => globalThis.__MOCK__.S().priv.relics.at(-1).id), item.id);
    await page.waitForSelector('.effect--relic img');
    await page.waitForFunction(() => document.querySelector('.effect--relic img')?.naturalWidth > 0);
    if (item.hiddenPhrases) {
      const ownedLabel = await page.$eval('.effect--relic', (e) => e.getAttribute('aria-label'));
      for (const phrase of item.hiddenPhrases) assert.ok(ownedLabel.includes(phrase), `领取后显示完整效果：${phrase}`);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-card__desc');
      const ownedDesc = await page.$eval('.relic-card__desc', (e) => e.textContent);
      for (const phrase of [...item.phrases, ...item.hiddenPhrases]) assert.ok(ownedDesc.includes(phrase), phrase);
    }
  } finally { await page.close(); }
});

async function closeWithEscape(page) {
  // Modal installs its keyboard trap in a layout effect. Focus the dialog explicitly;
  // after revival its focused button was removed, so autofocus no longer identifies readiness.
  await page.focus('.relic-panel');
  await page.keyboard.press('Escape');
  await closed(page);
}

test('phone/desktop: icons wrap, tooltips stay clear of three-choice dialogs, and chosen rewards survive observation and settlement', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  for (const [width, height] of [[640, 360], [1920, 1080]]) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, hasTouch: width < 768, isMobile: width < 768 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // External asset mirrors are optional for this DOM/UI check and must not hold navigation open.
      await page.setRequestInterception(true);
      page.on('request', (req) => req.url().startsWith(base) || req.url().startsWith('data:') ? req.continue() : req.abort());
      await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.relic-icons__heading');
      assert.match(await page.$eval('.relic-icons__heading', (el) => el.textContent), /RELICS\s*0/);
      assert.equal(await page.$('.relic-entry'), null);
      const entryPosition = await page.$eval('.relic-icons__heading', (el) => {
        const r = el.getBoundingClientRect();
        return { reachable: el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      assert.ok(entryPosition.reachable, `${width}: entry is covered`);
      assert.ok(entryPosition.left >= 0 && entryPosition.right <= width && entryPosition.top >= 0 && entryPosition.bottom <= height);
      assert.ok(entryPosition.left > width * .75, `${width}: collection is not on the right`);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      assert.match(await page.$eval('.relic-panel', (el) => el.textContent), /尚未获得收藏品/);
      assert.equal(await page.$eval('.relic-panel__rules', (el) => el.open), false);
      await page.click('.relic-panel__rules summary');
      assert.equal(await page.$eval('.relic-panel__rules', (el) => el.open), true);
      assert.ok(await page.$eval('.relic-odds', (el) => el.getBoundingClientRect().height > 0));
      await page.click('.relic-panel__rules summary');
      // The close button works immediately, even before the Modal's after-paint effect has run.
      await page.click('.relic-panel .modal__actions button');
      await closed(page);
      // Separately exercise actual Escape handling after the reusable Modal becomes keyboard-ready.
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      await closeWithEscape(page);
      // Two icons: inspect the actual requested frame, source art and shared tooltip before testing overflow.
      const first = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        const ordinary = RELICS.filter((r) => r.tier === 1 && !r.scratchTicket).slice(0, 2);
        globalThis.__MOCK__.mutate((s) => { s.priv.relics = ordinary.map((r, i) => ({ id: r.id, round: i + 1 })); });
        return ordinary[0];
      });
      await page.waitForFunction(() => document.querySelectorAll('.effect--relic').length === 2);
      const frames = await page.evaluate(() => {
        const icon = document.querySelector('.effect--relic').getBoundingClientRect();
        const effect = document.querySelector('.gm__effect-base .effect').getBoundingClientRect();
        return { same: icon.width === effect.width && icon.height === effect.height, x: icon.x, y: icon.y, width: icon.width, height: icon.height };
      });
      assert.ok(frames.same, `${width}: collectible frame differs from active effects`);
      await page.waitForFunction(() => [...document.querySelectorAll('.effect--relic img')].every((i) => i.complete && i.naturalWidth > 0));
      assert.equal(await page.$$eval('.effect--relic img', (els) => new Set(els.map((e) => e.src)).size), 2);
      if (width === 640) {
        await page.touchscreen.touchStart(frames.x + frames.width / 2, frames.y + frames.height / 2);
      } else {
        await page.hover('.effect--relic');
      }
      await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, first.name);
      assert.equal(await page.$eval('.tooltip .efftip > b', (e) => e.textContent), first.name);
      assert.equal(await page.$eval('.tooltip .efftip > p', (e) => e.textContent), first.desc);
      assert.match(await page.$eval('.tooltip .efftip__kind', (e) => e.textContent), /收藏品 · I · 普通 · 第 1 回合获得/);
      const tooltipBounds = await page.$eval('.tooltip', (e) => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; });
      assert.ok(tooltipBounds.left >= 0 && tooltipBounds.right <= width && tooltipBounds.top >= 0 && tooltipBounds.bottom <= height);
      await page.screenshot({ path: `${OUT}/relic-icons-${width === 640 ? 'phone' : 'desktop'}.png` });
      if (width === 640) await page.touchscreen.touchEnd();
      else await page.mouse.move(0, 0);
      await page.waitForFunction(() => !document.querySelector('.tooltip .efftip'));
      if (width !== 640) {
        await page.focus('.effect--relic');
        await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, first.name);
        assert.equal(await page.$eval('.tooltip .efftip > p', (e) => e.textContent), first.desc);
      }
      // Keyboard focus and touch long-press share the same Tooltip as other components; a tap opens the list.
      if (width === 640) await page.tap('.effect--relic');
      else await page.click('.effect--relic');
      await page.waitForSelector('.relic-panel');
      assert.equal(await page.$$eval('.relic-panel .relic-card', (els) => els.length), 2);
      await closeWithEscape(page);
      const names = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        const chosen = RELICS.slice(0, 15);
        globalThis.__MOCK__.mutate((s) => {
          s.priv.relics = chosen.map((r, i) => ({ id: r.id, round: i + 1 }));
          s.priv.relicReward = s.priv.relics.at(-1);
          s.pub.round = 13;
        });
        return chosen.map((r) => r.name);
      });
      await page.waitForSelector('.relic-icon__new');
      assert.equal(await page.$$eval('.effect--relic', (els) => els.length), 15);
      const wrapping = await page.$eval('.relic-icons__grid', (el) => {
        const last = el.querySelector('.tt-anchor:last-child .effect--relic');
        const r = last.getBoundingClientRect();
        const icons = [...el.querySelectorAll('.effect--relic')].map((e) => e.getBoundingClientRect());
        const rows = new Set(icons.map((r) => Math.round(r.top)));
        const columns = new Set(icons.map((r) => Math.round(r.left)));
        const ordered = icons.every((r, i) => i === 0 || (i % 5 === 0
          ? r.left < icons[i - 1].left && r.top === icons[0].top
          : r.left === icons[i - 1].left && r.top > icons[i - 1].top));
        const style = getComputedStyle(el);
        return { noScroll: style.overflowX === 'visible' && style.overflowY === 'visible', visible: last.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), rows: rows.size, columns: columns.size, ordered, right: r.right, bottom: r.bottom,
          cover: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 400) };
      });
      assert.ok(wrapping.noScroll && wrapping.visible && wrapping.rows === 5 && wrapping.columns === 3 && wrapping.ordered, `${width}: icons must fill columns downwards from right to left ${JSON.stringify(wrapping)}`);
      assert.ok(wrapping.right <= width && wrapping.bottom <= height);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-card');
      assert.equal(await page.$$eval('.relic-panel .relic-card', (els) => els.length), 15);
      assert.deepEqual(await page.$$eval('.relic-panel .relic-card__name', (els) => els.map((e) => e.textContent)), names);
      await page.screenshot({ path: `${OUT}/relics-${width === 640 ? 'phone' : 'desktop'}.png` });
      const bounds = await page.$eval('.relic-panel', (el) => {
        const r = el.getBoundingClientRect();
        const body = el.querySelector('.modal__body');
        body.scrollTop = body.scrollHeight;
        const last = el.querySelector('.relic-card:last-child').getBoundingClientRect();
        const b = body.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, lastVisible: last.bottom <= b.bottom + 1 && last.bottom > b.top, bodyScrollable: body.scrollHeight > body.clientHeight };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height, `${width}: modal escapes viewport`);
      assert.ok(bounds.lastVisible, `${width}: last acquired relic cannot be scrolled into view`);
      if (width === 640) assert.ok(bounds.bodyScrollable);
      await closeWithEscape(page);
      // Scouting follows public teammate records, not the viewer's private collection.
      const watchedNames = await page.evaluate(async () => {
        const { RELICS } = await import('/shared/relics.js');
        const chosen = RELICS.slice(20, 22);
        globalThis.__MOCK__.mutate((s) => {
          for (const p of s.pub.players) if (p.playerId !== 'p1') {
            p.relics = chosen.map((r) => ({ id: r.id, round: 2 }));
          }
        });
        globalThis.__MOCK__.pushPublic();
        return chosen.map((r) => r.name);
      });
      await page.click('.team__row:not(.is-self) .team__btn');
      await page.waitForSelector('.gm__watching');
      assert.match(await page.$eval('.relic-icons__heading', (el) => el.textContent), /RELICS\s*2/);
      assert.equal(await page.$$eval('.effect--relic', (els) => els.length), 2);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      assert.deepEqual(await page.$$eval('.relic-panel .relic-card__name', (els) => els.map((e) => e.textContent)), watchedNames);
      await closeWithEscape(page);
      await page.click('.gm__watching button');
      await page.waitForFunction(() => document.querySelectorAll('.effect--relic').length === 15);
      // The user's target is the battle HUD: the collectible column must also clear COST and battle controls.
      await page.evaluate(() => {
        const own = globalThis.__MOCK__.S().priv.relics;
        globalThis.__MOCK__.setPhase('COMBAT');
        globalThis.__MOCK__.mutate((s) => { s.priv.relics = own; });
      });
      await page.waitForSelector('.gm--combat .dpbox');
      await page.waitForFunction(() => document.querySelectorAll('.effect--relic').length === 15);
      await page.waitForFunction(() => !document.querySelector('.pbanner'));
      const combatBounds = await page.$eval('.relic-icons__grid', (el) => {
        const last = el.querySelector('.tt-anchor:last-child .effect--relic');
        const r = last.getBoundingClientRect();
        const dp = document.querySelector('.dpbox').getBoundingClientRect();
        return { visible: last.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), clearOfCost: r.right < dp.left, bottom: r.bottom };
      });
      assert.ok(combatBounds.visible && combatBounds.clearOfCost && combatBounds.bottom <= height, `${width}: battle HUD covers a collectible`);
      const combatFirstName = await page.evaluate(async () => {
        const { getRelic } = await import('/shared/relics.js');
        return getRelic(document.querySelector('.relic-icons__grid [data-relic-id]').dataset.relicId).name;
      });
      if (width === 640) {
        const r = await page.$eval('.effect--relic', (e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
        await page.touchscreen.touchStart(r.x, r.y);
      } else await page.hover('.effect--relic');
      await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, combatFirstName);
      await page.screenshot({ path: `${OUT}/relic-icons-combat-${width === 640 ? 'phone' : 'desktop'}.png` });
      if (width === 640) await page.touchscreen.touchEnd();
      else await page.mouse.move(0, 0);
      // Both timing modes show three cards; clicking sends the offer id and index.
      for (const reason of ['untimed', 'timed']) {
        const expected = await page.evaluate(async (reason) => {
          const { RELICS } = await import('/shared/relics.js');
          const own = globalThis.__MOCK__.S().priv.relics;
          globalThis.__MOCK__.setPhase('SETTLE');
          const cards = reason === 'untimed'
            ? [RELICS.find((r) => r.id === 'relic_154'), RELICS.find((r) => r.id === 'relic_155'), RELICS[20]]
            : ['relic_025', 'relic_156', 'relic_042'].map((id) => RELICS.find((r) => r.id === id));
          globalThis.__MOCK__.mutate((s) => {
            s.priv.relics = own;
            s.priv.relicOffer = { id: `ui:${reason}`, round: 13, reason: 'lowLoss', options: cards.map((r) => r.id) };
            s.priv.nextLpShield = 0;
            s.pub.relicChoosing = true;
            s.pub.deadline = reason === 'untimed' ? 0 : Date.now() + 30000;
          });
          return { id: cards[1].id, desc: cards[1].desc, offerId: `ui:${reason}`, before: own.length };
        }, reason);
        await page.waitForSelector('.relic-choice');
        await page.waitForFunction(() => !document.querySelector('.tooltip.is-shown'));
        await page.keyboard.press('Escape');
        assert.equal(await page.$$eval('.relic-choice', (els) => els.length), 1, 'reward waits for a selection');
        assert.equal(await page.$$eval('.relic-choice__card', (els) => els.length), 3);
        assert.match(await page.$eval('.relic-choice', (e) => e.textContent), /损失生命值 ≤ 5/);
        assert.ok((await page.$eval('.relic-choice', (e) => e.textContent)).includes(expected.desc));
        if (reason === 'untimed') {
          const text = await page.$eval('.relic-choice', (e) => e.textContent);
          assert.ok(text.includes('金钟罩') && text.includes('铁布衫') && text.includes('史诗'));
          assert.match(text, /90%/);
        }
        if (reason === 'untimed') assert.equal(await page.$('.relic-choice__note'), null);
        else assert.match(await page.$eval('.relic-choice__note', (e) => e.textContent), /超时自动选择第一件/);
        await page.waitForFunction(() => [...document.querySelectorAll('.relic-choice__art img')].every((i) => i.complete && i.naturalWidth > 0));
        if (reason === 'untimed') {
          const alpha = await page.$$eval('.relic-choice__art img', (imgs) => imgs.slice(0, 2).map((img) => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let transparent = false, opaque = false;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] === 0) transparent = true;
              if (data[i] === 255) opaque = true;
            }
            return { transparent, opaque };
          }));
          assert.ok(alpha.every((a) => a.transparent && a.opaque), '原创图片可解码且含真实透明背景和实体物件');
        }
        const layout = await page.$$eval('.relic-choice__card', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
        await page.screenshot({ path: `${OUT}/relic-choice-layout-${width}-${reason}.png` });
        assert.ok(layout.every((r) => r.top === layout[0].top && r.bottom <= height && r.left >= 0 && r.right <= width), JSON.stringify({ width, height, reason, layout }));
        await page.screenshot({ path: `${OUT}/relic-choice-${reason}-${width === 640 ? 'phone' : 'desktop'}.png` });
        await page.click('.relic-choice__card:nth-child(2)');
        await page.waitForFunction(() => !document.querySelector('.relic-choice'));
        const picked = await page.evaluate(() => ({ relics: globalThis.__MOCK__.S().priv.relics, requests: globalThis.__MOCK__.S().requests }));
        assert.equal(picked.relics.length, expected.before + 1);
        assert.equal(picked.relics.at(-1).id, expected.id);
        assert.deepEqual(picked.requests.filter(([t]) => t === 'g.relic').at(-1), ['g.relic', { offerId: expected.offerId, idx: 1 }]);
      }
      // Return to the original count for the settlement ownership regression below.
      await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = s.priv.relics.slice(0, 15); }));
      await page.evaluate(async () => {
        const { store } = await import('/js/store.js');
        const own = store.get().match.private.relics;
        globalThis.__MOCK__.setPhase('RESULT');
        const result = store.get().match.result;
        store.patch('match', { result: { ...result, players: result.players.map((p) => ({ ...p, relics: p.playerId === 'p1' ? own : own.slice(0, 2) })) } });
      });
      await page.waitForSelector('.settle__next');
      await page.click('.settle__next');
      await page.waitForSelector('.steam__detail');
      await page.click('.steam__detail');
      await page.waitForSelector('.rcard__relics');
      assert.match(await page.$eval('.rcard.is-self .rcard__relics > summary', (el) => el.textContent), /本局收藏品 · 15/);
      await page.click('.rcard.is-self .rcard__relics > summary');
      assert.equal(await page.$$eval('.rcard.is-self .relic-card', (els) => els.length), 15);
      assert.equal(await page.$$eval('.rcard:not(.is-self) .relic-card', (els) => els.length), 6);
      assert.deepEqual(errors, []);
    } catch (err) {
      await page.screenshot({ path: `${OUT}/relic-icons-failed-${width}.png` });
      throw err;
    } finally { await page.close(); }
  }
});

test('收藏栏：最多三列、更多入口、稀有度优先及隐藏票券可用（桌面／手机）', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  for (const [width, height] of [[1920, 1080], [640, 360]]) {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.setViewport({ width, height, hasTouch: width < 768, isMobile: width < 768 });
      await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.relic-icons__heading');
      for (const count of [15, 16, 64]) {
        const expected = await page.evaluate(async (count) => {
          const { RELICS } = await import('/shared/relics.js');
          const chosen = RELICS.slice(0, count);
          globalThis.__MOCK__.mutate((s) => { s.priv.relics = chosen.map((r) => ({ id: r.id, round: 1 })); });
          return [...chosen].sort((a, b) => b.tier - a.tier).slice(0, count > 15 ? 14 : 15).map((r) => r.id);
        }, count);
        await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll('.relic-icons__grid [data-relic-id]')]
          .map((e) => e.dataset.relicId)) === JSON.stringify(expected), {}, expected);
        assert.equal(!!await page.$('.relic-icons__more'), count > 15);
        const grid = await page.$eval('.relic-icons__grid', (el) => {
          const frames = [...el.querySelectorAll('.effect')].map((e) => e.getBoundingClientRect());
          const more = el.querySelector('.relic-icons__more');
          const r = more?.getBoundingClientRect();
          return { columns: new Set(frames.map((r) => Math.round(r.left))).size,
            rows: new Set(frames.map((r) => Math.round(r.top))).size,
            equalFrames: frames.every((r) => r.width === frames[0].width && r.height === frames[0].height),
            reachable: !more || more.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
            cover: more ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 400) : null,
            inViewport: frames.every((r) => r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight),
            label: more?.getAttribute('aria-label'), dots: more?.textContent.trim() };
        });
        assert.equal(grid.columns, 3); assert.equal(grid.rows, 5);
        assert.ok(grid.equalFrames && grid.reachable && grid.inViewport, JSON.stringify(grid));
        if (count > 15) {
          assert.equal(grid.label, '更多'); assert.equal(grid.dots, '⋯');
          await page.focus('.relic-icons__more');
          await page.keyboard.press('Enter');
          await page.waitForSelector('.relic-panel');
          assert.equal((await page.$$('.relic-panel .relic-card')).length, count);
          await closeWithEscape(page);
        }
      }
      await page.screenshot({ path: `${OUT}/relic-overflow-${width}.png` });
      // Low-rarity tickets may be hidden, but the full collection must retain their scratch shortcut.
      await page.evaluate(async () => {
        const { drawScratchTicket } = await import('/shared/scratchTickets.js');
        globalThis.__MOCK__.mutate((s) => {
          s.priv.scratch = { seq: 1, tickets: [{ id: 'scratch:overflow:1', tier: 1, relicId: 'relic_235', round: 1, opened: false }], lastResult: null };
          // The catalog can exceed the 64-entry sample: a ticket requires its identity card and collection record.
          for (const id of ['relic_234', 'relic_235']) if (!s.priv.relics.some((r) => r.id === id)) s.priv.relics.push({ id, round: 1 });
          s.scratchSecret = { 'scratch:overflow:1': drawScratchTicket(1, () => .5) };
        });
      });
      assert.equal(await page.$('.relic-icons__grid [data-relic-id="relic_235"]'), null);
      await page.click('.relic-icons__more');
      await page.waitForSelector('.relic-panel [data-relic-id="relic_235"]');
      await page.$eval('.relic-panel [data-relic-id="relic_235"]', (e) => e.scrollIntoView({ block: 'center' }));
      await page.click('.relic-panel [data-relic-id="relic_235"]');
      await page.waitForSelector('.scratch-coating');
      assert.equal(await page.$('.relic-panel'), null);
      await page.waitForFunction(() => globalThis.__MOCK__.S().requests.some(([t, p]) => t === 'g.scratchOpen' && p.ticketId === 'scratch:overflow:1'));
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});

test('木棍：整个界面逐位方块、输入值保留、更新与观战持续、Pixi文本及退出恢复', {
  skip: !ENABLED && 'set SP_E2E=1 and provide system Chrome', timeout: 120000,
}, async () => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto(`${base}/dev/game-mock.html?shot=1&phase=PREP`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.relic-icons__heading');
    await page.evaluate(() => {
      const input = document.createElement('input'); input.id = 'mask-input'; input.value = '金币123'; document.body.append(input);
      globalThis.__MOCK__.mutate((s) => { s.priv.relics = [{ id: 'relic_159', round: 7 }]; });
    });
    await page.waitForFunction(() => document.querySelector('#mask-input').style.fontFamily.startsWith('RelicDigits'));
    const font = await page.evaluate(async () => {
      await document.fonts.load('30px RelicDigits');
      const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 50;
      const c = canvas.getContext('2d'); c.font = '30px RelicDigits';
      const pixels = (text) => { c.clearRect(0, 0, 100, 50); c.fillText(text, 5, 35); return Array.from(c.getImageData(0, 0, 100, 50).data); };
      const a = pixels('1'), b = pixels('8');
      return { same: a.every((n, i) => n === b[i]), ink: a.some((n) => n > 0), loaded: document.fonts.check('30px RelicDigits'), value: document.querySelector('#mask-input').value,
        all: [...document.body.querySelectorAll('*')].filter((e) => e instanceof HTMLElement && !['SCRIPT', 'STYLE'].includes(e.tagName)).every((e) => e.style.fontFamily.startsWith('RelicDigits')) };
    });
    assert.deepEqual(font, { same: true, ink: true, loaded: true, value: '金币123', all: true });
    const pixi = await page.evaluate(async () => {
      const { ensurePixi } = await import('/js/render/app.js'); const P = await ensurePixi();
      const { installPixiNumberMask } = await import('/js/ui/numberMask.js'); installPixiNumberMask(P);
      const text = new P.Text('123', { fontFamily: 'sans-serif', fontSize: 20 }); text.updateText(true);
      const { ensureDamageFonts } = await import('/js/render/fx.js'); ensureDamageFonts();
      const bitmap = new P.BitmapText('123', { fontName: 'sp-dmg-phys', fontSize: 24 }); bitmap.updateText();
      const width = text.width; const square = new P.Text('■■■', { fontFamily: 'sans-serif', fontSize: 20 }); square.updateText(true);
      const bitmapSquare = new P.BitmapText('■■■', { fontName: 'sp-dmg-phys', fontSize: 24 }); bitmapSquare.updateText();
      const masked = Math.abs(width - square.width) < .01 && Math.abs(bitmap.width - bitmapSquare.width) < .01;
      const raw = text.text; if (bitmap.text !== '123') throw new Error('位图原始数字被修改');
      bitmapSquare.destroy();
      globalThis.__maskText = text; square.destroy(); bitmap.destroy(); return { masked, raw };
    });
    assert.deepEqual(pixi, { masked: true, raw: '123' });
    await page.screenshot({ path: `${OUT}/relic-stick-masked.png` });
    await page.evaluate(() => globalThis.__MOCK__.mutate((s) => { s.priv.relics = []; }));
    await page.waitForFunction(() => !document.querySelector('#mask-input').style.fontFamily.includes('RelicDigits'));
    assert.equal(await page.evaluate(() => globalThis.__maskText.text), '123');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
