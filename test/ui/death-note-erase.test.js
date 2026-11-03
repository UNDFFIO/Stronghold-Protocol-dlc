// 死亡笔记 × 死神之眼（维护者 2026-11-04 的要求）：获得死神之眼后，敌方详情卡片里的名字可直接点击写入死亡笔记。
// 点击只是书写名字的另一种入口——沿用每回合一次、按当时花费扣除资金——因此可用性完全由这一组判断决定。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deathNoteContext, canWriteEnemyName } from '../../public/js/ui/deathNote.js';
import { PHASE } from '../../shared/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function state(over = {}) {
  return {
    priv: {
      deathNote: { used: false, cost: 4 }, shinigamiEyes: true, funds: 10, ready: false,
      ...(over.priv || {}),
    },
    pub: { round: 3 },
    phase: PHASE.PREP, alive: true, conn: { status: 'online' },
    ...(over.top || {}),
  };
}
const ctx = (over = {}) => {
  const s = state(over);
  return deathNoteContext({ priv: s.priv, pub: s.pub, phase: s.phase, alive: s.alive, conn: s.conn });
};

test('死神之眼点击书写：无私有状态时没有上下文', () => {
  assert.equal(deathNoteContext(), null);
  assert.equal(deathNoteContext({ priv: null }), null);
  assert.equal(canWriteEnemyName(null), false);
});

test('死神之眼点击书写：与书写页共用准备阶段、存活、未准备和在线门槛', () => {
  assert.equal(canWriteEnemyName(ctx()), true);
  for (const [top, label] of [
    [{ phase: PHASE.COMBAT }, 'not prep'],
    [{ alive: false }, 'not alive'],
    [{ conn: { status: 'offline' } }, 'offline'],
    [{ conn: null }, 'no connection'],
    [{ priv: { ready: true } }, 'ready'],
  ]) {
    assert.equal(canWriteEnemyName(ctx({ top })), false, label);
  }
});

test('死神之眼点击书写：必须持有死亡笔记、已获得死神之眼且本回合尚未书写', () => {
  assert.equal(canWriteEnemyName(ctx({ priv: { deathNote: null } })), false, 'no death note record');
  assert.equal(canWriteEnemyName(ctx({ priv: { shinigamiEyes: false } })), false, 'names still hidden');
  assert.equal(canWriteEnemyName(ctx({ priv: { deathNote: { used: true, cost: 4 } } })), false, 'already written');
  assert.equal(canWriteEnemyName(ctx({ priv: { funds: 3 } })), false, 'funds below the cost');
  assert.equal(canWriteEnemyName(ctx({ priv: { funds: 4 } })), true, 'exactly the cost');
});

test('死神之眼点击书写：花费取服务端记录，获得眼睛后为4，否则回退为8', () => {
  assert.equal(ctx().cost, 4);
  assert.equal(ctx({ priv: { deathNote: { used: false } } }).cost, 4);
  assert.equal(ctx({ priv: { shinigamiEyes: false, deathNote: null } }).cost, 8);
  assert.equal(ctx({ priv: { shinigamiEyes: false, deathNote: { used: false, cost: 8 } } }).cost, 8);
  // the context carries the round and the two actions unchanged
  const onWrite = async () => true, onEyes = async () => true;
  const c = deathNoteContext({ priv: state().priv, pub: { round: 7 }, phase: PHASE.PREP, alive: true, conn: { status: 'online' }, onWrite, onEyes });
  assert.equal(c.round, 7); assert.equal(c.onWrite, onWrite); assert.equal(c.onEyes, onEyes);
});

test('敌人卡片的点击入口只在名字可书写时出现，hover 删除线有独立样式', () => {
  const detail = readFileSync(path.join(ROOT, 'public/js/ui/detailPanel.js'), 'utf8');
  assert.match(detail, /eraseName/);
  assert.match(detail, /dn-name/);
  assert.match(detail, /点击名字，将其写进死亡笔记/);
  assert.match(detail, /将「\{name\}」写入死亡笔记（\{cost\}资金）/);
  const css = readFileSync(path.join(ROOT, 'public/css/screens/game-panels.css'), 'utf8');
  assert.match(css, /\.dn-name:hover[^{]*\.dn-name__strike[^{]*\{[^}]*animation:/, 'hover draws the strike');
  assert.match(css, /@keyframes dn-strike/);
  assert.match(css, /prefers-reduced-motion[^{]*\{[^}]*dn-name/, 'reduced motion keeps the strike without the drawing');
});
