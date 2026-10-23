import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { install } from '../../server/sim/content/relics.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const IDS = ['relic_116', 'relic_117', 'relic_118', 'relic_119'];
const skill = (extra = {}) => ({ spType: 'INCREASE_WHEN_ATTACK', spCost: 20, initSp: 0,
  duration: 10, trigger: { rule: 'NEVER' }, ...extra });
const op = (id, position = 'MELEE') => chessRec({ id, position, skill: skill(),
  rangeGrid: [[0, 0]], stats: { maxHp: 2000, atk: 500, respawnTime: 0.5 } });
const defs = { chess: { guard: op('guard'), ranger: op('ranger', 'RANGED') },
  enemies: { dummy: enemyRec({ key: 'dummy', hp: 100, speed: 0 }) },
  tokens: { token: { name: 'test', position: 'RANGED', stats: { maxHp: 2000, atk: 0 }, rangeGrid: [[0, 0]], skill: null } } };
const piece = (chessId, uid, col) => ({ kind: 'chess', chessId, uid, row: 10, col });
const players = (relics) => [
  { playerId: 'p1', seat: 0, side: 'L', relics, units: [piece('guard', 1, 4), piece('ranger', 2, 5),
    { kind: 'token', tokenId: 'token', ownerUid: 1, uid: 3, row: 11, col: 4 }] },
  { playerId: 'p2', seat: 1, side: 'R', relics: [], units: [piece('guard', 4, 7), piece('ranger', 5, 8)] },
];
function setup(ids = IDS, extra = {}) {
  const h = makeBattle({ defs, players: players(ids), autoFinish: false, ...extra });
  h.step();
  for (const u of h.b.allyUnits) h.b.addBuff(u, { key: 'idle', flags: { disarm: true } });
  return h;
}
function defeat(h, killer = h.unit(1), damage = {}) {
  const target = h.spawn('dummy', { pos: [2, 4] });
  h.b.dealDamage(killer, target, { amount: 1000, type: 'true', ...damage });
  return target;
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const healthy = (h) => { assert.deepEqual(h.b.errors, []); checkInvariants(h.b); };

test('四件普通藏品：分别生效，候选/未持有不生效', () => {
  for (const ids of [[], ...IDS.map((id) => [id])]) {
    const h = setup(ids), u = h.unit(1), r = h.unit(2);
    u.hp = 1000;
    assert.equal(u.s.aspd, 100);
    assert.equal(u.skill.sp, 0);
    assert.equal(r.findBuff('relic:119')?.shield ?? 0, ids.includes('relic_119') ? 2000 : 0);
    assert.equal(defeat(h).alive, false);
    assert.equal(u.s.aspd, ids.includes('relic_116') ? 200 : 100);
    assert.equal(u.skill.sp, ids.includes('relic_117') ? 2 : 0);
    assert.equal(u.hp, ids.includes('relic_118') ? 1200 : 1000);
    healthy(h);
  }
});

test('撕咬的渴望：连续击倒刷新2秒而不叠加，独立于其他攻速增益', () => {
  const h = setup(['relic_116', 'relic_002']), u = h.unit(1);
  defeat(h);
  assert.equal(u.s.aspd, 210);
  h.run(1);
  defeat(h);
  assert.equal(u.s.aspd, 210);
  close(u.findBuff('relic:116').timeLeft, 2);
  h.run(1.5);
  assert.equal(u.s.aspd, 210);
  h.run(0.5);
  assert.equal(u.s.aspd, 110);
  healthy(h);
});

test('异香角：三种回复类型、充能上限、阻回与技能期间停回', () => {
  for (const spType of ['INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE']) {
    const rec = op('guard');
    rec.skill = { ...rec.skill, ...skill({ spType, spCost: 3, maxChargeTime: 2 }) };
    const h = setup(['relic_117'], { defs: { ...defs, chess: { ...defs.chess, guard: rec } } }), u = h.unit(1);
    u.skill.setSpTotal(0);
    defeat(h); close(u.skill.spTotal, 2);
    defeat(h); close(u.skill.spTotal, 4);
    defeat(h); close(u.skill.spTotal, 6);
    defeat(h); close(u.skill.spTotal, 6);
    u.skill.setSpTotal(0);
    const lock = h.b.addBuff(u, { key: 'noSp', flags: { noSp: true } });
    defeat(h); assert.equal(u.skill.spTotal, 0);
    h.b.removeBuff(u, lock);
    u.skill.activate('manual', { free: true });
    defeat(h); assert.equal(u.skill.spTotal, 0);
    healthy(h);
  }
});

test('渴血钳兽：按实时最大生命回复、治疗倍率与禁疗、满血不溢出', () => {
  const h = setup(['relic_118', 'relic_010']), u = h.unit(1);
  assert.equal(u.s.maxHp, 2400);
  u.hp = 1000;
  defeat(h); assert.equal(u.hp, 1240);
  h.b.addBuff(u, { key: 'healBoost', mods: { healingTakenMul: 1.5 } });
  defeat(h); assert.equal(u.hp, 1600);
  const noHeal = h.b.addBuff(u, { key: 'noHeal', flags: { healFree: true } });
  defeat(h); assert.equal(u.hp, 1600);
  h.b.removeBuff(u, noHeal);
  u.hp = 2390; defeat(h); assert.equal(u.hp, 2400);
  assert.equal(u.findBuff('overheal'), null);
  healthy(h);
});

test('击倒归属：队友、召唤物、无归属、友军死亡、漏怪与免死均不奖励持有者', () => {
  const h = setup(), u = h.unit(1);
  u.hp = 1000;
  for (const killer of [h.unit(4), h.unit(3), null]) defeat(h, killer);
  h.b.dealDamage(u, h.unit(4), { type: 'true', amount: 1e6 });
  const survivor = h.spawn('dummy', { pos: [2, 4] });
  h.b.on('kill', ({ victim }) => { if (victim === survivor) victim.hp = 1; });
  h.b.dealDamage(u, survivor, { type: 'true', amount: 1e6 });
  assert.equal(survivor.alive, true);
  const leaker = h.spawn('dummy', { pos: [2, 5] });
  h.b._remove(leaker, 'leak');
  assert.equal(u.s.aspd, 100); assert.equal(u.skill.sp, 0); assert.equal(u.hp, 1000);
  assert.equal(h.unit(5).findBuff('relic:119'), null);
  assert.equal(h.unit(3).findBuff('relic:119'), null);
  healthy(h);
});

test('击倒归属：元素爆发仍计入存活干员，来源已死亡则不触发', () => {
  const h = setup(), u = h.unit(1);
  u.hp = 1000;
  defeat(h, u, { type: 'element', element: 'burn', amount: 1000 });
  assert.equal(u.s.aspd, 200); assert.equal(u.skill.sp, 2); assert.equal(u.hp, 1200);
  h.b.dealDamage(null, u, { type: 'true', amount: 1e6 });
  defeat(h, u);
  assert.equal(u.hp, 0); assert.equal(u.findBuff('relic:116'), null);
  healthy(h);
});

test('庇护：部署给屏障、采用已增加的最大生命值，低优先级后消耗', () => {
  const h = setup(['relic_119', 'relic_010']), u = h.unit(2);
  assert.equal(u.ground, true, '按远程部署类型判断，不要求脚下是高台格');
  assert.equal(u.findBuff('relic:119').shield, 2400);
  assert.equal(h.unit(1).findBuff('relic:119'), null);
  h.b.addBuff(u, { key: 'newerShield', shield: 200 });
  h.b.dealDamage(null, u, { amount: 300, type: 'true' });
  assert.equal(u.findBuff('newerShield'), null);
  assert.equal(u.findBuff('relic:119').shield, 2300);
  assert.equal(u.hp, 2400);
  healthy(h);
});

test('庇护：重复ID/安装/部署通知不补屏障，真实移动再部署与死亡再部署重新获得', () => {
  const h = setup([...IDS, ...IDS, { id: 'relic_119' }, 'forged']), u = h.unit(2);
  h.b.dealDamage(null, u, { type: 'true', amount: 1000 });
  install(h.b);
  h.b.emit('deploy', { unit: u, initial: false });
  assert.equal(u.findBuff('relic:119').shield, 1000);
  u.hp = 1000;
  defeat(h, u);
  assert.equal(u.s.aspd, 200); assert.equal(u.skill.sp, 2); assert.equal(u.hp, 1200);
  assert.equal(h.b.moveRedeploy(u, 9, 5), true);
  assert.equal(u.findBuff('relic:119').shield, 2000);
  h.b.dealDamage(null, u, { type: 'true', amount: 1e6 });
  assert.equal(u.findBuff('relic:119'), null);
  assert.ok(h.runUntil(() => u.alive && u.deployed, 2));
  assert.equal(u.findBuff('relic:119').shield, 2000);
  healthy(h);
});

test('庇护：仅原始与当前部署类型都为远程时生效，近战变为远程也排除', () => {
  const h = setup(), u = h.unit(1), r = h.unit(2);
  u.def = { ...u.def, position: 'RANGED' };
  h.b.moveRedeploy(u, 9, 4);
  assert.equal(u.findBuff('relic:119'), null);
  h.b.removeBuff(r, 'relic:119');
  r.def = { ...r.def, position: 'ALL' };
  h.b.moveRedeploy(r, 9, 5);
  assert.equal(r.findBuff('relic:119'), null);
  healthy(h);
});

test('四件普通藏品：JSON输入两端重建的真实击倒及部署结果一致', () => {
  const raw = { ...defs, stages: { trial: flatStage({ id: 'trial' }) } };
  const spec = buildBattleSpec({ battleId: 'kills', fieldId: 'n:p1', kind: 'normal', seed: 116,
    stageId: 'trial', round: 1, timeLimit: 3, players: players(IDS), routes: flatRoutes(),
    spawns: [{ time: 0, enemyKey: 'dummy', routeIndex: 0, pos: [2, 4] }],
  });
  const results = [];
  for (const json of [false, true]) {
    const b = createBattleFromSpec(json ? JSON.parse(JSON.stringify(spec)) : spec,
      new DataSource(json ? JSON.parse(JSON.stringify(raw)) : raw, null), { quiet: true });
    b.step();
    const u = b.allyUnits.find((x) => x.uid === 1);
    u.hp = 1000;
    const e = b.enemies[0];
    assert.equal(e.alive, true);
    b.dealDamage(u, e, { type: 'true', amount: 1000 });
    assert.equal(u.s.aspd, 200); assert.equal(u.skill.sp, 2); assert.equal(u.hp, 1200);
    b.runToEnd(5);
    assert.deepEqual(b.errors, []);
    results.push(resultDigest(b.result()).hash);
  }
  assert.equal(results[0], results[1]);
});
