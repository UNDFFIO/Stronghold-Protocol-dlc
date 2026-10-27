import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const enabled = process.env.SP_E2E === '1' && existsSync(CHROME);
let server, browser, base;
before(async () => {
  if (!enabled) return;
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  server = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  base = `http://127.0.0.1:${server.port}`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); await server?.close(); });

test('extra challenge vote and successful settlement fit desktop and mobile; consent remains pending until everyone agrees', {
  skip: !enabled, timeout: 180000,
}, async () => {
  mkdirSync('.cache/endless-ui', { recursive: true });
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      await page.setViewport({ width, height });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(`${base}/dev/game-mock.html?shot=1&render=fallback&phase=PREP`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!globalThis.__MOCK__);
      await page.evaluate(async () => {
        const M = globalThis.__MOCK__;
        M.setPhase('CONTINUE_VOTE');
        M.mutate(s => {
          const id = M.store.get().me.playerId;
          s.pub.round = 15;
          s.pub.deadline = 0;
          s.pub.endlessVote = { voters: [id, s.pub.players.find(p => p.playerId !== id && !p.isBot).playerId], agreed: [] };
        });
        M.pushPublic();
        // UI transport stub; authoritative consent/phase validation is covered by test/match/endless.test.js.
        const { actions } = await import('/js/ui/gameActions.js');
        actions.endlessVote = async agree => {
          if (agree) M.mutate(s => { s.pub.endlessVote.agreed = [M.store.get().me.playerId]; });
          M.pushPublic();
        };
      });
      await page.waitForSelector('.endless-vote-actions');
      const text = await page.$eval('.modal', el => el.textContent);
      assert.match(text, /继续挑战投票/);
      const buttons = await page.$$('.endless-vote-actions button');
      for (const button of buttons) {
        await button.evaluate(el => el.scrollIntoView({ block: 'center' }));
        const box = await button.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height, 'voting actions are reachable');
      }
      await buttons[0].click();
      await page.waitForFunction(() => document.querySelector('.endless-vote-actions button')?.disabled);
      assert.ok(await page.$('.endless-vote-actions'), 'one vote does not dismiss the dialog');
      await page.screenshot({ path: `.cache/endless-ui/vote-${width}.png` });
      await page.evaluate(() => {
        const M = globalThis.__MOCK__;
        M.mutate(s => { delete s.pub.endlessVote; });
        M.setPhase('PREP');
        M.mutate(s => { s.pub.round = 21; s.pub.extraRound = 6; s.pub.extraRounds = 5; s.pub.extraBossRound = true; });
        M.pushPublic();
      });
      await page.waitForFunction(() => document.querySelector('.roundbox__num')?.textContent === '6');
      assert.equal(await page.$eval('.roundbox__label', el => el.textContent), '额外回合');
      assert.equal(await page.$('.endless-status'), null, 'no floating extra-round status');
      await page.click('[data-testid="check-player"]');
      await page.waitForSelector('.edrawer');
      await page.click('.edrawer .tabs__tab:nth-child(2)');
      await page.waitForSelector('.edrawer__extra');
      assert.equal(await page.$eval('.edrawer__extra', el => el.textContent), '敌方生命与攻击 +30%');
      await page.screenshot({ path: `.cache/endless-ui/intel-${width}.png` });
      // The screenshot's ordinary extra round must use the extra index, rather than total round 37 or hidden ??.
      await page.evaluate(() => {
        const M = globalThis.__MOCK__;
        M.mutate(s => { s.pub.round = 37; s.pub.extraRound = 22; s.pub.extraBossRound = false; });
        M.pushPublic();
      });
      await page.waitForFunction(() => document.querySelector('.roundbox__num')?.textContent === '22');
      assert.equal(await page.$eval('.edrawer__extra', el => el.textContent), '敌方生命与攻击 +110%');
      const round = await page.$eval('.roundbox', el => {
        const box = el.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: el.clientWidth, scroll: el.scrollWidth };
      });
      assert.ok(round.left >= 0 && round.right <= width && round.top >= 0 && round.bottom <= height && round.scroll <= round.width,
        'extra round fits the top bar');
      await page.click('.edrawer__close');
      await page.screenshot({ path: `.cache/endless-ui/round-${width}.png` });
      await page.evaluate(() => {
        const M = globalThis.__MOCK__;
        M.setPhase('RESULT');
        const result = M.store.get().match.result;
        M.store.patch('match', { result: { ...result, victory: true, hiddenCleared: true, extraRounds: 11,
          roundsPassed: 15,
          players: result.players.map(p => ({ ...p, alive: false, victory: true, roundsPassed: 15, extraRounds: 11 })) } });
      });
      await page.waitForSelector('.sself__title', { timeout: 60000 });
      assert.match(await page.$eval('.sself', el => el.textContent), /成功 · 额外通过 11 回合/);
      assert.equal(await page.$eval('.sself__title', el => el.textContent), '模拟完成');
      await new Promise(resolve => setTimeout(resolve, 600));
      await page.screenshot({ path: `.cache/endless-ui/result-${width}.png` });
      await page.click('.settle__next');
      await page.waitForSelector('.steam__detail');
      assert.match(await page.$eval('.steam', el => el.textContent), /成功 · 额外通过 11 回合/);
      await page.click('.steam__detail');
      await page.waitForSelector('.result__headline');
      assert.match(await page.$eval('.result', el => el.textContent), /成功 · 额外通过 11 回合/);
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  }
});
