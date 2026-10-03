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
  await page.waitForFunction(() => !document.querySelector('.relic-panel'), { timeout: 2000 });
}

async function closeWithEscape(page) {
  // The declarative Modal renders before its useEffect installs the keyboard listener. Its documented
  // autofocus runs 30 ms AFTER installation: wait for that observable lifecycle signal, not a sleep or
  // a longer close timeout. The entry click focused the entry, so this focus change can only come from Modal.
  await page.waitForFunction(() => {
    const panel = document.querySelector('.relic-panel');
    return panel && document.activeElement === panel.querySelector('.modal__actions button');
  }, { timeout: 2000 });
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
        globalThis.__MOCK__.mutate((s) => { s.priv.relics = RELICS.slice(0, 2).map((r, i) => ({ id: r.id, round: i + 1 })); });
        return RELICS[0];
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
      await page.click('.effect--relic');
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
        return { noScroll: style.overflowX === 'visible' && style.overflowY === 'visible', visible: last.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)), rows: rows.size, columns: columns.size, ordered, right: r.right, bottom: r.bottom };
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
      // Prep scouting changes the field and bond owner. The collection remains the viewer's m.private list.
      await page.click('.team__row:not(.is-self) .team__btn');
      await page.waitForSelector('.gm__watching');
      assert.match(await page.$eval('.relic-icons__heading', (el) => el.textContent), /RELICS\s*15/);
      assert.equal(await page.$$eval('.effect--relic', (els) => els.length), 15);
      await page.click('.relic-icons__heading');
      await page.waitForSelector('.relic-panel');
      assert.deepEqual(await page.$$eval('.relic-panel .relic-card__name', (els) => els.map((e) => e.textContent)), names);
      await closeWithEscape(page);
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
      if (width === 640) {
        const r = await page.$eval('.effect--relic', (e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
        await page.touchscreen.touchStart(r.x, r.y);
      } else await page.hover('.effect--relic');
      await page.waitForFunction((name) => document.querySelector('.tooltip.is-shown .efftip > b')?.textContent === name, {}, first.name);
      await page.screenshot({ path: `${OUT}/relic-icons-combat-${width === 640 ? 'phone' : 'desktop'}.png` });
      if (width === 640) await page.touchscreen.touchEnd();
      else await page.mouse.move(0, 0);
      // Both qualifying reasons automatically show exactly three cards; clicking sends the offer id and index.
      for (const reason of ['perfect', 'comeback']) {
        const expected = await page.evaluate(async (reason) => {
          const { RELICS } = await import('/shared/relics.js');
          const own = globalThis.__MOCK__.S().priv.relics;
          globalThis.__MOCK__.setPhase('SETTLE');
          const cards = RELICS.slice(reason === 'perfect' ? 20 : 27, reason === 'perfect' ? 23 : 30);
          globalThis.__MOCK__.mutate((s) => {
            s.priv.relics = own;
            s.priv.relicOffer = { id: `ui:${reason}`, round: 13, reason, options: cards.map((r) => r.id) };
            s.priv.nextLpShield = reason === 'comeback' ? 2 : 0;
            s.pub.relicChoosing = true;
            s.pub.deadline = reason === 'perfect' ? 0 : Date.now() + 30000;
          });
          return { id: cards[1].id, desc: cards[1].desc, offerId: `ui:${reason}`, before: own.length };
        }, reason);
        await page.waitForSelector('.relic-choice');
        await page.waitForFunction(() => !document.querySelector('.tooltip.is-shown'));
        await page.keyboard.press('Escape');
        assert.equal(await page.$$eval('.relic-choice', (els) => els.length), 1, 'reward waits for a selection');
        assert.equal(await page.$$eval('.relic-choice__card', (els) => els.length), 3);
        assert.match(await page.$eval('.relic-choice', (e) => e.textContent), reason === 'perfect' ? /无漏怪奖励/ : /下回合获得 2 点护盾/);
        assert.ok((await page.$eval('.relic-choice', (e) => e.textContent)).includes(expected.desc));
        assert.match(await page.$eval('.relic-choice__note', (e) => e.textContent), reason === 'perfect' ? /选好后进入下一阶段/ : /超时自动选择第一件/);
        await page.waitForFunction(() => [...document.querySelectorAll('.relic-choice__art img')].every((i) => i.complete && i.naturalWidth > 0));
        const layout = await page.$$eval('.relic-choice__card', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
        assert.ok(layout.every((r) => r.top === layout[0].top && r.bottom <= height && r.left >= 0 && r.right <= width));
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
