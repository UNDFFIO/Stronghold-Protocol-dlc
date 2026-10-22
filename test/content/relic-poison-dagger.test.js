import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, flatStage, flatRoutes, checkInvariants } from '../helpers/battleHarness.js';
import { install } from '../../server/sim/content/relics.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { weaknessRetype } from '../../server/sim/content/items/battle.js';

const ID = 'relic_240';
const guard = chessRec({ id: 'poison_guard', skill: null, stats: { atk: 500, maxHp: 2000, respawnTime: 0.5 } });
const dummy = enemyRec({ key: 'poison_dummy', hp: 1e6, speed: 0, def: 10000, res: 20 });
const piece = { uid: 1, kind: 'chess', chessId: guard.id, row: 10, col: 4 };
const player = (relics = [ID]) => ({ playerId: 'p1', seat: 0, side: 'L', relics, units: [piece] });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fight(relics = [ID], extra = {}) {
  const h = makeBattle({ defs: { chess: { [guard.id]: guard }, enemies: { poison_dummy: dummy } },
    players: [player(relics)], autoFinish: false, ...extra });
  h.step();
  const enemy = h.spawn('poison_dummy', { pos: [0, 0] });
  return { h, enemy, u: h.unit(1) };
}
const layers = (h, e) => h.b.snapshot().poison?.find(([id]) => id === e.id)?.[1] ?? 0;

test('淬毒匕首：防御前110%分五段，每秒结算法抗，无即时伤害或第六段', () => {
  const { h, enemy, u } = fight();
  const hits = [];
  h.b.on('damaged', ({ target, dmg, amount }) => { if (target === enemy) hits.push([dmg.type, amount]); });
  assert.equal(h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' }), 0);
  close(enemy.hp, 1e6);
  assert.equal(layers(h, enemy), 1);
  h.step(29);
  assert.equal(hits.length, 0);
  for (let i = 1; i <= 5; i++) {
    h.step(i === 1 ? 2 : 30);
    close(1e6 - enemy.hp, i * 220 * 0.8);
    assert.equal(hits.length, i);
    assert.equal(layers(h, enemy), i < 5 ? 1 : 0);
  }
  h.step(60);
  assert.deepEqual(hits.map(([type]) => type), Array(5).fill('arts'));
  assert.deepEqual(h.b.errors, []); checkInvariants(h.b);
});

test('淬毒匕首：弱点伤害不能把毒伤重新分裂叠层，五段保持法术伤害', () => {
  const { h, enemy, u } = fight();
  h.b.addBuff(enemy, { key: 'test:weakness', mods: { defFlat: -10000, resFlat: 60 } });
  h.b.on('hit', ({ source, target, dmg }) => weaknessRetype(dmg, source, target));
  const hits = [];
  h.b.on('damaged', ({ target, dmg }) => { if (target === enemy) hits.push(dmg); });
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' });
  h.step(181);
  assert.equal(hits.length, 5);
  assert.ok(hits.every((dmg) => dmg.type === 'arts' && dmg.tags.filter((tag) => tag === 'relic:240').length === 1));
  assert.equal(layers(h, enemy), 0);
  close(1e6 - enemy.hp, 220);
  assert.deepEqual(h.b.errors, []);
});

test('淬毒匕首：定时技能命中也在完整一秒后结算第一段', () => {
  const { h, enemy, u } = fight();
  let at;
  const times = [];
  h.b.on('damaged', ({ target }) => { if (target === enemy) times.push(h.b.time); });
  h.b.after(0.1, () => { at = h.b.time; h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' }); });
  h.step(183);
  assert.equal(times.length, 5);
  for (let i = 0; i < 5; i++) close(times[i] - at, i + 1);
});

test('淬毒匕首：逐次叠加独立到期，重复ID/安装不重复触发，盾与实时法抗有效', () => {
  const { h, enemy, u } = fight([ID, ID, 'relic_041', 'relic_044']);
  install(h.b);
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' });
  h.step(31);
  close(1e6 - enemy.hp, 1000 * 1.2 / 5 * 1.1 * 0.8);
  h.b.dealDamage(u, enemy, { amount: 500, type: 'phys', isSkill: true });
  assert.equal(layers(h, enemy), 2);
  h.b.addBuff(enemy, { key: 'test:res', mods: { resFlat: 30 }, duration: Infinity });
  h.b.addBuff(enemy, { key: 'test:shield', shield: 100, duration: Infinity });
  const hp = enemy.hp;
  h.step(31);
  close(hp - enemy.hp, (1000 + 500) * 1.2 / 5 * 1.1 * 0.5 - 100);
  h.step(90);
  assert.equal(layers(h, enemy), 1);
  h.step(30);
  assert.equal(layers(h, enemy), 0);
  assert.deepEqual(h.b.errors, []);
});

test('淬毒匕首：闪避/无敌/取消不挂毒；队友、召唤物及其他伤害不转换', () => {
  const { h, enemy, u } = fight();
  const dodge = h.b.addBuff(enemy, { key: 'test:dodge', mods: { dodgePhys: 1 } });
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' });
  assert.equal(layers(h, enemy), 0);
  h.b.removeBuff(enemy, dodge);
  const immune = h.b.addBuff(enemy, { key: 'test:immune', flags: { invulnerable: true } });
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' });
  assert.equal(layers(h, enemy), 0);
  h.b.removeBuff(enemy, immune);
  h.b.on('hit', ({ dmg }) => { if (dmg.tags.includes('cancel')) dmg.cancel = true; });
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys', tags: ['cancel'] });
  assert.equal(layers(h, enemy), 0);
  for (const type of ['arts', 'true', 'elemental']) assert.ok(h.b.dealDamage(u, enemy, { amount: 1000, type }) > 0);
  u.ownerId = 'p2';
  assert.ok(h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' }) > 0);
  u.ownerId = 'p1'; u.kind = 'token';
  assert.ok(h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' }) > 0);
  u.kind = 'op';
  assert.equal(layers(h, enemy), 0);
  assert.deepEqual(h.b.errors, []);
});

test('淬毒匕首：来源死亡后继续结算，再部署仍仅一份加成，目标死亡清除层数', () => {
  const { h, enemy, u } = fight();
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' });
  h.b.dealDamage(null, u, { amount: 1e6, type: 'true' });
  h.step(31);
  close(1e6 - enemy.hp, 176);
  assert.ok(u.alive);
  close(u.s.physDealtMul, 1.1);
  h.b.dealDamage(u, enemy, { amount: 1000, type: 'phys' });
  assert.equal(layers(h, enemy), 2);
  h.b.dealDamage(null, enemy, { amount: 1e9, type: 'true' });
  assert.equal(layers(h, enemy), 0);
  assert.ok(!enemy.buffs.some((buff) => buff.tags.includes('relic:240')));
  h.step(180);
  assert.deepEqual(h.b.errors, []);
});

test('淬毒匕首：JSON BattleSpec重建的伤害与层数确定一致', () => {
  const raw = { chess: { [guard.id]: guard }, enemies: { poison_dummy: dummy }, stages: { poison_stage: flatStage({ id: 'poison_stage' }) } };
  const spec = buildBattleSpec({ battleId: 'poison', fieldId: 'n:p1', kind: 'normal', seed: 77,
    stageId: 'poison_stage', round: 4, timeLimit: 10, players: [player()], routes: flatRoutes(),
    spawns: [{ time: 0, enemyKey: 'poison_dummy', routeIndex: 0, pos: [10, 5] }] });
  const a = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  let sawPoison = false;
  for (let i = 0; i < 300 && !a.finished; i++) {
    a.step(); b.step();
    assert.deepEqual(a.snapshot(), b.snapshot());
    sawPoison ||= !!a.snapshot().poison;
  }
  assert.ok(sawPoison);
  assert.equal(resultDigest(a.result()).hash, resultDigest(b.result()).hash);
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
});
