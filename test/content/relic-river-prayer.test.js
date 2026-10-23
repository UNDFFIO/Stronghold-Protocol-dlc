import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { install as installRelics } from '../../server/sim/content/relics.js';
import { ELEMENT } from '../../server/sim/constants.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const ID = 'relic_134';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function field(relics = [ID], other = []) {
  const h = makeBattle({
    defs: { chess: { guard: chessRec({ id: 'guard', skill: null }) },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, atk: 1000, def: 500, res: 60, speed: 0 }) } },
    players: [
      { playerId: 'p1', seat: 0, side: 'L', relics, units: [{ uid: 1, kind: 'chess', chessId: 'guard', row: 10, col: 4 }] },
      { playerId: 'p2', seat: 1, side: 'R', relics: other, units: [{ uid: 2, kind: 'chess', chessId: 'guard', row: 10, col: 5 }] },
    ], autoFinish: false, captureNoisy: true,
  });
  h.step();
  h.b.addBuff(h.unit(1), { key: 'idle', flags: { disarm: true } });
  h.b.addBuff(h.unit(2), { key: 'idle', flags: { disarm: true } });
  const target = h.spawn('dummy', { pos: [2, 4] });
  h.b.addBuff(target, { key: 'idle', flags: { disarm: true } });
  return { h, target, source: h.unit(1) };
}
function burst(h, source, target, element) {
  return h.b.dealDamage(source, target, { type: 'element', element, amount: target.gaugeMax, canDodge: false });
}
function valid(h) { assert.deepEqual(h.b.errors, []); checkInvariants(h.b); }

test('河谷祭祈：灼燃倍率、额外法抗降低、无来源与重复安装/多人持有', () => {
  for (const [ids, other, expected, res] of [
    [[], [], 7000, 40], [[ID], [], 26600, 20], [[ID, ID], [ID], 26600, 20],
  ]) {
    const { h, source, target } = field(ids, other);
    installRelics(h.b);
    h.b.addBuff(source, { key: 'huge', mods: { dmgDealtMul: 10, artsDealtMul: 10 } });
    h.b.addBuff(target, { key: 'fragile', mods: { elementalTakenMul: 1.5 } });
    const hp = target.hp;
    burst(h, source, target, 'burn');
    close(hp - target.hp, expected * 1.5);
    close(target.s.res, res);
    assert.equal(target.findBuff('burnBurst').duration, 10);
    h.run(10);
    close(target.s.res, 60);
    assert.equal(target.elem.burn, 0);
    valid(h);
  }
  assert.equal(ELEMENT.burn.enemy.elemDamage, 7000, '共享常量未修改');
});

test('河谷祭祈：凋亡每秒2000点、额外最终攻击倍率、恢复及清除', () => {
  const { h, source, target } = field();
  burst(h, source, target, 'apoptosis');
  close(target.s.atk, 350);
  const hp = target.hp;
  h.run(1);
  close(hp - target.hp, 2000);
  assert.ok(target.s.atk > 350 && target.s.atk < 700);
  h.run(14);
  close(hp - target.hp, 30000);
  close(target.s.atk, 1000);
  assert.equal(target.elem.apoptosis, 0);
  valid(h);
});

test('河谷祭祈：神经立即12000点、十次无来源元素持续伤害与爆发锁', () => {
  const { h, source, target } = field();
  const hp = target.hp;
  burst(h, source, target, 'neural');
  close(hp - target.hp, 12000);
  assert.equal(target.findBuff('palsy').stacks, 3);
  assert.equal(burst(h, source, target, 'burn'), 0);
  h.run(10);
  close(hp - target.hp, 22000);
  assert.equal(target.elem.neural, 0);
  h.run(1);
  close(hp - target.hp, 22000);
  valid(h);
});

test('河谷祭祈：侵蚀先永久减防240，0.03秒十段物理伤害，经DEF且不重复', () => {
  const { h, source, target } = field();
  const hp = target.hp;
  burst(h, source, target, 'erosion');
  close(hp - target.hp, 5000);
  close(target.s.def, 260);
  h.step(8);
  close(hp - target.hp, 5000 + 8 * 1240);
  h.step();
  close(hp - target.hp, 5000 + 10 * 1240);
  h.run(8);
  close(hp - target.hp, 5000 + 10 * 1240);
  close(target.s.def, 260);
  burst(h, source, target, 'erosion');
  close(target.s.def, 20);
  valid(h);
});

test('河谷祭祈：全敌方增强包含队友/无来源积累，友方爆发不增强', () => {
  for (const from of ['teammate', 'none']) {
    const { h, target } = field();
    const hp = target.hp;
    burst(h, from === 'none' ? null : h.unit(2), target, 'burn');
    close(hp - target.hp, 26600);
    valid(h);
  }
  const { h, source, target } = field();
  h.b.addBuff(source, { key: 'hp', mods: { hpFlat: 100000 } });
  source.hp = source.s.maxHp;
  const hp = source.hp;
  burst(h, target, source, 'burn');
  close(hp - source.hp, 1200);
  valid(h);
});

test('河谷祭祈：JSON战斗输入重建后四种爆发及result digest一致', () => {
  for (const element of ['burn', 'neural', 'apoptosis', 'erosion']) {
    const raw = { chess: {}, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, speed: 0 }) },
      stages: { river: flatStage({ id: 'river' }) } };
    const spec = buildBattleSpec({ battleId: 'river', fieldId: 'n:p1', kind: 'normal', seed: 134,
      stageId: 'river', round: 7, timeLimit: 17, routes: flatRoutes(),
      players: [{ playerId: 'p1', seat: 0, side: 'L', relics: [ID], units: [] }],
      spawns: [{ time: 0, enemyKey: 'dummy', routeIndex: 0 }],
    });
    const results = [];
    for (const json of [false, true]) {
      const b = createBattleFromSpec(json ? JSON.parse(JSON.stringify(spec)) : spec,
        new DataSource(json ? JSON.parse(JSON.stringify(raw)) : raw, null), { quiet: true });
      b.step();
      b.dealDamage(null, b.enemies[0], { type: 'element', element, amount: 1000 });
      b.runToEnd(20);
      assert.deepEqual(b.errors, []);
      results.push(resultDigest(b.result()).hash);
    }
    assert.equal(results[0], results[1], element);
  }
});

test('河谷祭祈：持续伤害经过屏障、来源死亡不取消，移除爆发锁即停止', () => {
  const { h, source, target } = field();
  burst(h, source, target, 'neural');
  const hp = target.hp;
  h.b.addBuff(target, { key: 'shield', shield: 1500, duration: Infinity });
  h.b.dealDamage(null, source, { type: 'true', amount: 1e6 });
  assert.equal(source.alive, false);
  h.run(1);
  close(target.hp, hp);
  close(target.findBuff('shield').shield, 500);
  h.run(1);
  close(hp - target.hp, 500);
  h.b.removeBuff(target, 'neuralBurst');
  assert.equal(target.elem.neural, 0);
  h.run(2);
  close(hp - target.hp, 500);
  valid(h);
});
