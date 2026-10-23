import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants, flatStage, flatRoutes } from '../helpers/battleHarness.js';
import { install as installRelics } from '../../server/sim/content/relics.js';
import { TOKEN_IDS } from '../../server/sim/content/tokens.js';
import { DataSource, getDefaultSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function field(relics, other = [], yan = true) {
  return makeBattle({
    defs: { chess: { guard: chessRec({ id: 'guard', bonds: yan ? ['yanShip'] : [], skill: null }) },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, speed: 0 }) } },
    players: [
      { playerId: 'p1', seat: 0, side: 'L', relics, units: [{ uid: 1, kind: 'chess', chessId: 'guard', row: 10, col: 4 }] },
      { playerId: 'p2', seat: 1, side: 'R', relics: other, units: [{ uid: 2, kind: 'chess', chessId: 'guard', row: 10, col: 5 }] },
    ], autoFinish: false,
  });
}

test('冰中火：损伤和伤害分别提高75%，无来源/队友伤害有效，多人及重复安装不叠加', () => {
  for (const ids of [[], ['relic_133'], ['relic_133', 'relic_133']]) {
    const h = field(ids, ids);
    h.step();
    installRelics(h.b);
    const e = h.spawn('dummy', { pos: [2, 4] });
    const mul = ids.length ? 1.75 : 1;
    h.b.dealDamage(h.unit(2), e, { type: 'element', element: 'burn', amount: 100 });
    close(e.elem.burn, 100 * mul);
    const hp = e.hp;
    h.b.dealDamage(null, e, { type: 'elemental', amount: 100 });
    close(hp - e.hp, 100 * mul);
    h.b.dealDamage(null, h.unit(1), { type: 'element', element: 'burn', amount: 100 });
    close(h.unit(1).elem.burn, 100);
    h.b.addBuff(e, { key: 'fragile', mods: { elementalTakenMul: 1.2 } });
    const before = e.hp;
    h.b.dealDamage(null, e, { type: 'element', element: 'burn', amount: 1000 });
    close(before - e.hp, 7000 * mul * 1.2);
    assert.deepEqual(h.b.errors, []);
    checkInvariants(h.b);
  }
});

test('天师锦囊：持有者首个炎干员原位召唤，不占格、不继承属性、不免疫损伤，重复部署不再召唤', () => {
  const h = field(['relic_132', 'relic_132']);
  installRelics(h.b);
  h.step();
  const dragons = () => h.b.allyUnits.filter((u) => u.defId === TOKEN_IDS.yanyou && u.mem.relicYanyou);
  assert.equal(dragons().length, 1);
  const y = dragons()[0];
  assert.equal(y.ownerId, 'p1');
  assert.equal(y.tileR, h.unit(1).tileR);
  assert.equal(y.tileC, h.unit(1).tileC);
  assert.equal(h.b._occ[y.tileR * 21 + y.tileC], h.unit(1));
  close(y.s.atk, 600);
  close(y.s.maxHp, 12000);
  h.b.dealDamage(null, y, { type: 'element', element: 'burn', amount: 100 });
  close(y.elem.burn, 100);
  h.b.emit('deploy', { unit: h.unit(1), initial: false });
  installRelics(h.b);
  h.b.emit('deploy', { unit: h.unit(1), initial: false });
  assert.equal(dragons().length, 1);
  h.b.kill(h.unit(1));
  h.run(21);
  assert.ok(h.unit(1).alive && h.unit(1).deployed, 'operator really redeployed');
  assert.equal(dragons().length, 1);
  assert.equal(h.b._occ[y.tileR * 21 + y.tileC], h.unit(1));
  assert.ok(h.b.relocate(y, h.unit(2).tileR, h.unit(2).tileC));
  assert.equal(h.b._occ[h.unit(1).tileR * 21 + h.unit(1).tileC], h.unit(1));
  assert.equal(h.b._occ[y.tileR * 21 + y.tileC], h.unit(2), 'relocation preserves destination occupancy');
  h.b.kill(y);
  h.step();
  assert.equal(h.b._occ[y.tileR * 21 + y.tileC], h.unit(2), 'flyer death preserves ground occupancy');
  assert.deepEqual(h.b.errors, []);
  checkInvariants(h.b);
});

test('天师锦囊与冰中火：JSON BattleSpec重建后召唤、灼燃伤害和结果摘要一致', () => {
  const raw = { chess: { guard: chessRec({ id: 'guard', bonds: ['yanShip'], skill: null }) },
    enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, speed: 0 }) },
    stages: { sachet: flatStage({ id: 'sachet' }) } };
  const spec = buildBattleSpec({ battleId: 'sachet', fieldId: 'n:p1', kind: 'normal', seed: 132,
    stageId: 'sachet', round: 1, timeLimit: 20, routes: flatRoutes(),
    players: [{ playerId: 'p1', seat: 0, side: 'L', relics: ['relic_132', 'relic_133'],
      units: [{ uid: 1, kind: 'chess', chessId: 'guard', row: 10, col: 4 }] }],
    spawns: [{ time: 0, enemyKey: 'dummy', routeIndex: 0 }],
  });
  const hashes = [];
  for (const json of [false, true]) {
    const b = createBattleFromSpec(json ? JSON.parse(JSON.stringify(spec)) : spec,
      new DataSource(json ? JSON.parse(JSON.stringify(raw)) : raw, getDefaultSource()), { quiet: true });
    b.runToEnd(22);
    const y = b.allyUnits.find((u) => u.mem.relicYanyou);
    assert.ok(y && y.stats.dmg > 0 && y.stats.elem > 0, 'summon really attacks and applies burn');
    assert.deepEqual(b.errors, []);
    checkInvariants(b);
    hashes.push(resultDigest(b.result()).hash);
  }
  assert.equal(hashes[0], hashes[1]);
});

test('天师锦囊：未持有/非炎干员不触发，每个持有者和每场战斗独立', () => {
  for (const [a, b, yan, count] of [[[], [], true, 0], [['relic_132'], [], false, 0], [['relic_132'], ['relic_132'], true, 2]]) {
    const h = field(a, b, yan);
    h.step();
    assert.equal(h.b.allyUnits.filter((u) => u.mem.relicYanyou).length, count);
    assert.deepEqual(h.b.errors, []);
    checkInvariants(h.b);
  }
});

test('天师锦囊：与九炎的两只强化炎佑并存，盟约召唤仍免疫元素损伤', () => {
  const ids = Array.from({ length: 9 }, (_, i) => `yan_${i}`);
  const h = makeBattle({
    defs: { chess: Object.fromEntries(ids.map((id) => [id, chessRec({ id, bonds: ['yanShip'], skill: null })])) },
    players: [{ playerId: 'p1', seat: 0, side: 'L', relics: ['relic_132'],
      bonds: { yanShip: { count: 9, active: true, tier: 3, layers: 0 } },
      units: ids.map((chessId, i) => ({ kind: 'chess', chessId, row: 10 + Math.floor(i / 7), col: 3 + i % 7 })) }],
    autoFinish: false,
  });
  h.step();
  const dragons = h.b.allyUnits.filter((u) => u.defId === TOKEN_IDS.yanyou);
  assert.equal(dragons.length, 3);
  const relic = dragons.filter((u) => u.mem.relicYanyou);
  assert.equal(relic.length, 1);
  close(relic[0].s.atk, 600);
  for (const y of dragons.filter((u) => u.mem.bondYan)) {
    assert.ok(y.s.atk > 600 && y.s.maxHp > 12000);
    h.b.dealDamage(null, y, { type: 'element', element: 'burn', amount: 100 });
    close(y.elem.burn, 0);
  }
  assert.deepEqual(h.b.errors, []);
  checkInvariants(h.b);
});
