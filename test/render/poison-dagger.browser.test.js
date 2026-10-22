import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
test('淬毒匕首：真实Spine与缓存模型按层变黑，消退后恢复像素颜色', {
  skip: process.env.RENDER_E2E !== '1' || !existsSync(CHROME), timeout: 120000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, pipe: true, args: ['--no-sandbox', '--no-first-run'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${srv.port}/dev/render-demo.html?scene=normal-m01&t=18&paused=1&panel=0`);
    await page.waitForFunction(() => window.__demo?.ready && [...window.__demo.view.debug.views.values()]
      .some(v => v.isEnemy && v.alive && v.spineReady && v._impBox()), { timeout: 60000 });
    const result = await page.evaluate(() => {
      const { app, views } = window.__demo.view.debug;
      app.stop();
      const v = [...views.values()].find(v => v.isEnemy && v.alive && v.spineReady && v._impBox());
      const ctx = v.ctx;
      v.swapT = 1;
      ctx.clipAllowed = () => false;
      let frame = 0;
      ctx.frameNo = () => ++frame;
      const sample = { x: v.x, y: v.y, hp: v.hp, maxHp: v.maxHp, sp: 0, spMax: 0, flags: 0, anim: 0 };
      const modes = [];
      const previews = [];
      for (const interval of [0, 1]) {
        ctx.impostorInterval = () => interval;
        const colors = [], brightness = [];
        for (const poison of [0, 1, 3, 10, 0]) {
          v.sync({ ...sample, poison }, 18);
          for (let i = 0; i < 3; i++) v.update(0, ctx.cam(), 18);
          ctx.impostors?.flush();
          const model = interval ? v.imp?.sprite : v.actor.spine;
          if (!model) throw new Error('Expected real model path: ' + interval);
          colors.push(model.tint);
          const pixels = app.renderer.extract.pixels(model);
          let light = 0, ink = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 100) {
            light += pixels[i] + pixels[i + 1] + pixels[i + 2]; ink++;
          }
          if (!ink) throw new Error('No visible model pixels: ' + JSON.stringify({ interval, poison, alpha: model.alpha, visible: model.visible }));
          brightness.push(light / ink);
          if (interval === 1) previews.push({ poison, image: app.renderer.extract.canvas(model).toDataURL('image/png') });
        }
        modes.push({ interval, colors, brightness });
      }
      const panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;gap:24px;background:#20242b;color:white;font:20px sans-serif';
      for (const [index, { poison, image }] of previews.entries()) {
        const item = document.createElement('div');
        item.style.textAlign = 'center';
        const img = document.createElement('img');
        img.src = image; img.style.cssText = 'display:block;width:160px;height:220px;object-fit:contain;margin-bottom:16px';
        item.append(img, index === 4 ? '恢复原色' : `${poison}层`);
        panel.append(item);
      }
      document.body.append(panel);
      return modes;
    });
    for (const { interval, colors, brightness } of result) {
      assert.ok(colors[0] > colors[1] && colors[1] > colors[2] && colors[2] > colors[3], JSON.stringify({ interval, colors }));
      assert.equal(colors[0], colors[4]);
      const r = (colors[3] >> 16) & 255, g = (colors[3] >> 8) & 255, b = colors[3] & 255;
      assert.ok(g > b && b > r, 'poison tint retains a subtle green cast');
      assert.ok(brightness[0] > brightness[1] && brightness[1] > brightness[2] && brightness[2] > brightness[3], JSON.stringify({ interval, brightness }));
      assert.ok(Math.abs(brightness[0] - brightness[4]) < 1, JSON.stringify({ interval, brightness }));
    }
    const out = fileURLToPath(new URL('../e2e/out/', import.meta.url));
    mkdirSync(out, { recursive: true });
    await page.screenshot({ path: `${out}/poison-dagger-render.png` });
  } finally { await browser?.close(); await srv.close(); }
});
