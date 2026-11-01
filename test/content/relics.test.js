import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, flatStage, flatRoutes, checkInvariants } from '../helpers/battleHarness.js';
import { install as installRelics } from '../../server/sim/content/relics.js';
import { DataSource } from '../../server/sim/simdata.js';
import { buildBattleSpec, createBattleFromSpec, resultDigest } from '../../server/sim/spec.js';
import { canTargetEnemy } from '../../server/sim/targeting.js';

const ATK = 'relic_003';
test('决心：深巡、幽灵鲨和乌尔比安的真实技能可由远处水月范围内的敌人触发', () => {
  for (const base of ['chess_char_1_04', 'chess_char_2_07', 'chess_char_5_05']) {
    for (const form of ['a', 'b']) for (const relics of [[], ['relic_246']]) {
      const h = makeBattle({
        players: [player(relics, [piece(`${base}_${form}`), piece('chess_char_4_09_a', 2, 12, 8)])],
        defs: { enemies: { probe: enemyRec({ key: 'probe', hp: 1e9, atk: 0, speed: 0 }) } },
        flags: { startOpCooldown: 0 }, autoFinish: false,
      });
      h.step();
      const u = h.unit(1);
      assert.equal(u.skill.activations, 0);
      h.spawn('probe', { pos: [12, 9] });
      u.skill.addCharge(1);
      h.run(2);
      assert.equal(u.skill.activations, relics.length ? 1 : 0, `${base}_${form} / ${relics}`);
      healthy(h);
    }
  }
});

test('决心：敌人进入借用范围后，各类范围策略实际开启技能并保留非范围策略限制', () => {
  for (const rule of ['DEFAULT', 'SEARCH', 'ACTIVE_RANGE', 'SKILL_RANGE', 'CUSTOM_RANGE', 'NEVER', 'TAKE_DAMAGE']) {
    for (const id of ['relic_245', 'relic_246']) {
      const f = fight([id], {
        defs: { chess: {
          r_guard: op('r_guard', 'WARRIOR', { bonds: ['egirShip'], rangeGrid: [[0, 0]],
            skill: { spCost: 10, initSp: 0, spType: 'INCREASE_WITH_TIME' } }),
          donor: op('donor', 'WARRIOR', { charId: 'char_437_mizuki', rangeGrid: [[0, 0], [0, 1]], stats: { atk: 0 } }),
        }, enemies: { probe: enemyRec({ key: 'probe', hp: 1e7, speed: 0 }) } },
        kits: { r_guard: () => ({ skill: { kind: 'duration', duration: 20, spCost: 10, initSp: 0,
          trigger: { rule, grid: ['ACTIVE_RANGE', 'SKILL_RANGE', 'CUSTOM_RANGE'].includes(rule) ? [[0, 0]] : null },
          mods: { atkPct: 1 } } }) },
        players: [player([id], [piece(), piece('donor', 2, 10, 7)])], enemies: [{ key: 'probe' }],
      });
      f.step();
      const u = f.unit(1), e = f.enemies()[0];
      e.x = 8; e.y = 10;
      f.run(0.2);
      assert.equal(u.skill.activations, 0, 'range never bypasses the SP requirement');
      u.skill.gainSp(10, 'test');
      e.x = 1; e.y = 9;
      f.run(0.2);
      assert.equal(u.skill.activations, 0, 'an enemy outside both ranges does not trigger');
      e.x = 8; e.y = 10;
      f.b.addBuff(u, { key: 'test:egir-silence', duration: Infinity, flags: { silence: true } });
      f.run(0.2);
      assert.equal(u.skill.activations, 0, 'borrowed range does not bypass silence');
      f.b.removeBuff(u, 'test:egir-silence');
      f.run(1.5);
      const expected = id === 'relic_246' && !['NEVER', 'TAKE_DAMAGE'].includes(rule) ? 1 : 0;
      assert.equal(u.skill.activations, expected, `${id} / ${rule}`);
      healthy(f);
    }
  }
});

test('决心：技能开启范围实时跟随提供者退场、范围变化与再部署，且不借用队友范围', () => {
  const f = fight(['relic_246'], {
    defs: { chess: {
      r_guard: op('r_guard', 'WARRIOR', { bonds: ['egirShip'], rangeGrid: [[0, 0]],
        skill: { spCost: 10, initSp: 0, spType: 'INCREASE_WITH_TIME' } }),
      donor: op('donor', 'WARRIOR', { charId: 'char_1012_skadi2', rangeGrid: [[0, 0]], stats: { atk: 0 } }),
    }, enemies: { probe: enemyRec({ key: 'probe', hp: 1e7, speed: 0 }) } },
    kits: { r_guard: () => ({ skill: { kind: 'duration', duration: 20, spCost: 10, initSp: 0,
      trigger: { rule: 'ACTIVE_RANGE', grid: [[0, 0]] }, mods: { atkPct: 1 } } }) },
    players: [player(['relic_246'], [piece(), piece('donor', 2, 10, 7)]),
      player([], [piece('donor', 3, 10, 8)], { playerId: 'p2', seat: 1 })], enemies: [{ key: 'probe' }],
  });
  f.step();
  const u = f.unit(1), donor = f.unit(2), e = f.enemies()[0];
  e.x = 8; e.y = 10;
  u.skill.gainSp(10, 'test');
  f.run(0.2);
  assert.equal(u.skill.activations, 0, 'teammate provider does not trigger');
  donor.rangeGrid = [[0, 0], [0, 1]];
  f.b.refreshRange(donor);
  f.b.retreat(donor);
  f.run(0.2);
  assert.equal(u.skill.activations, 0, 'retreated provider does not trigger');
  f.b.redeploy(donor, { free: true });
  f.run(0.2);
  assert.equal(u.skill.activations, 1, 'current provider range participates without moving the recipient');
  healthy(f);
});

test('阿戈尔升级藏品：累计对空、阻挡与击倒攻速，隔离队友和非成员', () => {
  for (const [id, stage] of [['relic_244', 1], ['relic_245', 2], ['relic_246', 3]]) {
    const f = fight([id], { defs: { chess: {
      r_guard: op('r_guard', 'WARRIOR', { bonds: ['egirShip'] }), outsider: op('outsider'),
    } }, players: [player([id, id], [piece(), piece('outsider', 2, 10, 5)]),
      player([], [piece('r_guard', 3, 10, 6)], { playerId: 'p2', seat: 1 })] });
    f.step();
    const u = f.unit(1), other = f.unit(2), mate = f.unit(3);
    const air = { alive: true, deployed: true, isFlying: true, s: { flags: {} } };
    assert.equal(canTargetEnemy(u, air, { groundOnly: true }), true);
    assert.equal(canTargetEnemy(other, air, {}), false);
    assert.equal(canTargetEnemy(mate, air, {}), false);
    assert.equal(u.s.blockCnt, u.base.blockCnt + (stage >= 2 ? 1 : 0));
    installRelics(f.b);
    assert.equal(u.s.blockCnt, u.base.blockCnt + (stage >= 2 ? 1 : 0));
    const knockOut = () => { const e = f.b.spawnEnemy('enemy_1001_slime'); f.b.dealDamage({ source: u, target: e, amount: 1e9, type: 'true' }); };
    knockOut(); f.run(4); knockOut();
    assert.equal(u.s.aspd, u.base.aspd + (stage >= 2 ? 100 : 0));
    f.run(8.1);
    assert.equal(u.s.aspd, u.base.aspd);
    healthy(f);
  }
});

test('决心：动态共享本人水月范围，限速保留减速，撤退立即解除且重部署不叠加', () => {
  const f = fight(['relic_246'], { defs: { chess: {
    r_guard: op('r_guard', 'WARRIOR', { bonds: ['egirShip'], rangeGrid: [[0, 0]] }),
    donor: op('donor', 'WARRIOR', { charId: 'char_437_mizuki', bonds: ['egirShip'], rangeGrid: [[0, 0], [0, 1]] }),
  }, enemies: { probe: enemyRec({ key: 'probe', hp: 100000, speed: 1 }) } },
  players: [player(['relic_246'], [piece(), piece('donor', 2, 10, 7)])], enemies: [{ key: 'probe' }] });
  f.step();
  const u = f.unit(1), donor = f.unit(2), e = f.enemies()[0];
  assert.ok(u.rangeKeys.includes(donor.rangeKeys[0]));
  e.x = donor.tileC; e.y = donor.tileR;
  f.b.addBuff(e, { key: 'speed', duration: Infinity, mods: { moveMul: 3 } });
  assert.equal(e.s.moveSpeed, e.base.moveSpeed);
  f.b.addBuff(e, { key: 'slow', duration: Infinity, mods: { moveMul: 0.1 } });
  close(e.s.moveSpeed, e.base.moveSpeed * 0.3, 'slows preserved');
  f.b.removeBuff(e, e.findBuff('slow'));
  f.b.retreat(donor);
  assert.ok(!u.rangeKeys.includes(donor.rangeKeys[0]));
  assert.equal(e.s.moveSpeed, e.base.moveSpeed * 3);
  f.b.redeploy(donor);
  assert.equal(e.s.moveSpeed, e.base.moveSpeed);
  healthy(f);
});
test('决心：两种提供者的原生范围变化驱动真实普攻，隔离队友且不递归借用', () => {
  for (const charId of ['char_437_mizuki', 'char_1012_skadi2']) {
    const f = fight(['relic_246'], { defs: { chess: {
      r_guard: op('r_guard', 'WARRIOR', { bonds: ['egirShip'], rangeGrid: [[0, 0]] }),
      donor: op('donor', 'WARRIOR', { charId, bonds: ['egirShip'], rangeGrid: [[0, 0]], stats: { atk: 0 } }),
    }, enemies: { probe: enemyRec({ key: 'probe', hp: 100000, speed: 0 }) } },
    players: [player(['relic_246'], [piece(), piece('donor', 2, 10, 7)]),
      player([], [piece('donor', 3, 10, 6)], { playerId: 'p2', seat: 1 })], enemies: [{ key: 'probe' }] });
    f.step(); const u = f.unit(1), donor = f.unit(2), mate = f.unit(3), e = f.enemies()[0];
    assert.ok(!u.rangeKeys.includes(mate.rangeKeys[0]), 'teammate range is excluded');
    e.x = 8; e.y = 10;
    let hits = 0;
    f.b.on('damaged', ({ source, target }) => { if (source === u && target === e) hits++; });
    f.run(1); assert.equal(hits, 0);
    donor.rangeGrid = [[0, 0], [0, 1]];
    f.b.refreshRange(donor);
    const extended = [...donor.mem.egirOwnRangeKeys()];
    f.run(1); assert.ok(hits > 0, 'ordinary attacks reach the borrowed range');
    assert.deepEqual(donor.mem.egirOwnRangeKeys(), extended, 'native range remains distinct');
    const before = hits; f.b.retreat(donor); f.run(2);
    assert.equal(hits, before, 'retreated provider no longer enables distant attacks');
    healthy(f);
  }
});

test('阿戈尔决心：序列化战斗规格两端结算一致', () => {
  const raw = {
    chess: {
      r_guard: op('r_guard', 'WARRIOR', { bonds: ['egirShip'], rangeGrid: [[0, 0]] }),
      donor: op('donor', 'WARRIOR', { charId: 'char_437_mizuki', bonds: ['egirShip'], rangeGrid: [[0, 0], [0, 1]] }),
    },
    enemies: { probe: enemyRec({ key: 'probe', hp: 1000, speed: 0.1 }) },
    stages: { egir_stage: flatStage({ id: 'egir_stage' }) },
  };
  const spec = buildBattleSpec({ battleId: 'egir-test', seed: 244, stageId: 'egir_stage', kind: 'normal', round: 8,
    timeLimit: 10, players: [player(['relic_246'], [piece(), piece('donor', 2, 10, 7)])], routes: flatRoutes(),
    spawns: [{ time: 0, enemyKey: 'probe', routeIndex: 0, pos: [10, 8] }] });
  const server = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const browser = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  for (const b of [server, browser]) {
    b.step(); b.addBuff(b.enemies[0], { key: 'fast', duration: Infinity, mods: { moveMul: 3 } });
    b.runToEnd(12); assert.deepEqual(b.errors, []); checkInvariants(b);
    assert.equal(b.result().killed, 1);
  }
  assert.equal(resultDigest(server.result()).hash, resultDigest(browser.result()).hash);
});

test('官方负面藏品：出生满血、真实伤害、后续生成、重复持有及安装不叠加', () => {
  for (const [relics, mul] of [[['relic_177'], 1.4], [['relic_181'], 1.3], [['relic_185'], 1.25],
    [['relic_187'], 1.3], [['relic_177', 'relic_181', 'relic_185', 'relic_187', 'relic_177'], 2.25]]) {
    const f = fight(relics, { enemies: [{ key: 'curse_enemy', mods: { hpMul: 2, atkMul: 2, defMul: 2 } }],
      defs: { chess: { r_guard: op('r_guard') },
        enemies: { curse_enemy: enemyRec({ key: 'curse_enemy', hp: 1000, atk: 100, def: 100, speed: 0 }) } },
      players: [player(relics), player(relics, [piece('r_guard', 2, 10, 6)], { playerId: 'p2', seat: 1 })] });
    f.step(); const e = f.enemies()[0];
    close(e.s.maxHp, 2000 * mul, 'HP'); close(e.hp, e.s.maxHp, 'full health');
    close(e.s.atk, 200 * mul, 'ATK'); close(e.s.def, 200 * mul, 'DEF');
    close(f.unit(1).s.maxHp, 2000, 'allies unchanged');
    installRelics(f.b); installRelics(f.b); close(e.s.atk, 200 * mul, 'installation idempotent');
    const child = f.b.spawnEnemy('curse_enemy', { mods: e.mods });
    close(child.s.maxHp, e.s.maxHp, 'inherited spawn mods receive one curse');
    f.b.dealDamage({ source: null, target: child, amount: 100, type: 'true' });
    close(child.hp, child.s.maxHp - 100, 'real damage on increased health');
    healthy(f);
  }
});

test('官方负面藏品：共享首领实际生命强化，服务端与浏览器JSON spec结果一致', () => {
  const raw = { enemies: { curse_boss: enemyRec({ key: 'curse_boss', hp: 1000, atk: 100, def: 100, speed: 0 }) },
    stages: { curse_stage: flatStage({ id: 'curse_stage' }) } };
  for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
    const spec = buildBattleSpec({ seed: 28, stageId: 'curse_stage', kind, round: 8, timeLimit: 2,
      players: [player(['relic_177'], [])], routes: flatRoutes(), boss: { poolHp: 1000, poolMax: 1000 },
      spawns: [{ time: 0, enemyKey: 'curse_boss', count: 1, tag: kind === 'boss' || kind === 'hidden' ? 'boss' : null }] });
    const server = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
    const browser = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
    for (const b of [server, browser]) {
      b.step(); const e = b.enemies[0];
      close(e.s.maxHp, 1400, 'leader HP'); close(e.hp, 1400, 'leader full health');
      b.dealDamage({ source: null, target: e, amount: 140, type: 'true' });
      close(e.hp, 1260, '140 damage removes 140 effective health');
      if (e.bossPool) close(e.bossPool.hp, 900, '100 base-pool units');
      b.runToEnd(3); assert.deepEqual(b.errors, []);
    }
    assert.equal(resultDigest(server.result()).hash, resultDigest(browser.result()).hash);
  }
});
test('死亡笔记：相同JSON spec在服务端和浏览器数据源移除相同类型，结果digest一致', () => {
  const raw = { enemies: { enemy_erased: enemyRec({ key: 'enemy_erased', hp: 1000, speed: 0 }) },
    stages: { note_stage: flatStage({ id: 'note_stage' }) } };
  const spec = buildBattleSpec({ seed: 19, stageId: 'note_stage', kind: 'normal', round: 5, timeLimit: 10,
    players: [player([], [])], routes: flatRoutes(), flags: { deathNoteEnemyKeys: ['enemy_erased'] },
    spawns: [{ time: 5, enemyKey: 'enemy_erased', count: 10 }] });
  const server = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const browser = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  server.runToEnd(12); browser.runToEnd(12);
  assert.equal(server.result().total, 0);
  assert.equal(server.result().reason, 'cleared');
  assert.equal(resultDigest(server.result()).hash, resultDigest(browser.result()).hash);
  assert.equal(server.result().perPlayer.p1.coins, 0);
  assert.deepEqual(server.errors, []); assert.deepEqual(browser.errors, []);
});

test('死亡笔记解锁数据：同一干员再次部署死亡会累计，撤退与队友不计入本人', () => {
  const f = makeBattle({ autoFinish: false, defs: { chess: { note_op: op('note_op') } },
    players: [player([], [piece('note_op')]), { ...player([], [piece('note_op', 2, 10, 6)]), playerId: 'p2', seat: 1 }] });
  f.step();
  const owner = f.unit(1), teammate = f.unit(2);
  f.b.kill(owner); f.b.kill(owner);
  assert.equal(f.b._buildResult().perPlayer.p1.deaths, 1);
  f.b.kill(teammate);
  assert.equal(f.b._buildResult().perPlayer.p1.deaths, 1);
  f.run(2);
  assert.equal(owner.alive, true);
  f.b.kill(owner);
  assert.equal(f.b._buildResult().perPlayer.p1.deaths, 2);
  f.run(2); f.b.retreat(owner);
  assert.equal(f.b._buildResult().perPlayer.p1.deaths, 2);
});

test('死亡笔记：移除整波和后续召唤，不计击杀、悬赏或漏怪，其他类型保持不变', () => {
  for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
    const f = makeBattle({ kind, flags: { deathNoteEnemyKeys: ['erased'] }, autoFinish: false,
      defs: { enemies: { erased: enemyRec({ key: 'erased', speed: 0 }), kept: enemyRec({ key: 'kept', speed: 0 }) } },
      enemies: [{ key: 'erased', count: 12, time: 5, bounty: { coins: 8 } }, { key: 'kept' }] });
    f.step();
    assert.equal(f.b.total, 1);
    assert.equal(f.b._pending.length, 0, 'erased scheduled types never enter the spawn queue');
    assert.equal(f.enemies().length, 1);
    assert.equal(f.enemies()[0].name, 'kept');
    assert.equal(f.b.spawnEnemy('erased'), null, 'runtime summons are removed too');
    f.run(6);
    assert.equal(f.b.killed, 0);
    const result = f.b._buildResult().perPlayer.p1;
    assert.equal(result.coins, 0);
    assert.deepEqual(result.leaked, []);
    assert.deepEqual(f.b.errors, []);
  }
});

const HP = 'relic_010';
const DEF = 'relic_047';
const GUARD_ATK = 'relic_145';
const SP = 'relic_038';
const PHYS = 'relic_043';
const REGEN = 'relic_080';
const BELL = 'relic_154';
const SHIRT = 'relic_155';

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);

test('负面死亡笔记：开场仅杀死本人一名干员，绕过保命并禁止所有再部署路径', () => {
  const f = fight(['relic_242', 'relic_242'], {
    players: [player(['relic_242', 'relic_242'], [piece(), piece('r_guard', 2, 10, 5)]),
      { ...player([], [piece('r_guard', 3, 10, 6)]), playerId: 'p2', seat: 1 }],
  });
  let survival = 0;
  f.b.on('kill', ({ victim }) => { survival++; victim.hp = victim.s.maxHp; });
  f.b.on('death', ({ unit }) => {
    assert.equal(f.b.redeploy(unit), false, 'death-hook revival is refused');
    assert.equal(f.b._deploy(unit), false, 'direct deployment cannot bypass permanent removal');
  });
  f.step();
  const dead = f.b.allyUnits.filter((u) => u.ownerId === 'p1' && !u.alive);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].hp, 0);
  assert.equal(dead[0].removed, true);
  assert.equal(f.unit(3).alive, true);
  assert.equal(survival, 0, 'forced death bypasses kill-hook survival');
  assert.equal(f.b._buildResult().perPlayer.p1.deaths, 1);
  f.run(3);
  assert.equal(dead[0].alive, false, 'automatic redeployment is refused');
  f.b.emit('battleStart', {});
  assert.equal(f.b.allyUnits.filter((u) => u.ownerId === 'p1' && !u.alive).length, 1);
  assert.deepEqual(f.b.errors, []);
});

test('负面死亡笔记：每名持有者独立触发，空阵容不出错，下一场重新生效', () => {
  for (let round = 1; round <= 2; round++) {
    const f = fight(['relic_242'], { round,
      players: [player(['relic_242']), { ...player(['relic_242'], [piece('r_guard', 2, 10, 6)]), playerId: 'p2', seat: 1 },
        { ...player(['relic_242'], []), playerId: 'p3', seat: 2 }],
    });
    f.step();
    assert.equal(f.unit(1).alive, false);
    assert.equal(f.unit(2).alive, false);
    assert.deepEqual(f.b.errors, []);
  }
  const plain = fight(); plain.step();
  assert.equal(plain.unit(1).alive, true);
});

test('负面死亡笔记：种子相同则随机目标相同，不同种子可选择不同干员', () => {
  const selected = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const run = () => {
      const f = fight(['relic_242'], { seed,
        players: [player(['relic_242'], [piece(), piece('r_guard', 2, 10, 5), piece('r_guard', 3, 10, 6)])] });
      f.step();
      return f.b.allyUnits.find((u) => u.removed).uid;
    };
    const target = run();
    assert.equal(run(), target);
    selected.add(target);
  }
  assert.ok(selected.size > 1);
});

test('负面死亡笔记：排除召唤物，JSON两端选择与结果一致', () => {
  const raw = { chess: { r_guard: op('r_guard') },
    tokens: { note_token: { name: 'test summon', stats: { maxHp: 2000 }, rangeGrid: [[0, 0]], skill: null } },
    stages: { note_stage: flatStage({ id: 'note_stage' }) } };
  for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
    const spec = buildBattleSpec({ seed: 17, stageId: 'note_stage', kind, round: 5, timeLimit: 5,
      players: [player(['relic_242'], [piece(),
        { uid: 2, kind: 'token', tokenId: 'note_token', row: 10, col: 5 }])], routes: flatRoutes(), spawns: [] });
    const server = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
    const browser = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
    server.step(); browser.step();
    assert.equal(server.allyUnits.find((u) => u.kind === 'op').removed, true);
    assert.equal(server.allyUnits.find((u) => u.kind === 'token').alive, true);
    server.runToEnd(6); browser.runToEnd(6);
    assert.equal(resultDigest(server.result()).hash, resultDigest(browser.result()).hash);
    assert.deepEqual(server.errors, []); assert.deepEqual(browser.errors, []);
    checkInvariants(server); checkInvariants(browser);
  }
});
const op = (id, profession = 'WARRIOR', extra = {}) => chessRec({
  id, profession, skill: null,
  stats: { maxHp: 2000, atk: 500, def: 200, respawnTime: 0.5 },
  ...extra,
});
const piece = (chessId = 'r_guard', uid = 1, row = 10, col = 4) => ({ uid, kind: 'chess', chessId, row, col });
const player = (relics, units = [piece()], extra = {}) => ({ playerId: 'p1', seat: 0, side: 'L', relics, units, ...extra });
function fight(relics = [], extra = {}) {
  return makeBattle({
    defs: { chess: { r_guard: op('r_guard') } },
    players: [player(relics)], timeLimit: 60, autoFinish: false,
    ...extra,
  });
}
function healthy(h) {
  assert.deepEqual(h.b.errors, []);
  checkInvariants(h.b);
}

test('原创收藏品：整组兑换聚合属性，动态增益移除与重复安装不会累加', () => {
  for (const [id, expectedDef, expectedRes] of [[BELL, 0, 18.5], [SHIRT, 875, 0]]) {
    const h = fight([id, id, DEF], { defs: { chess: { r_guard: op('r_guard', 'WARRIOR', {
      stats: { maxHp: 2000, atk: 500, def: 275, res: 12.5, respawnTime: 0.5 },
    }) } } });
    h.step();
    const u = h.unit(1);
    close(u.s.def, id === BELL ? expectedDef : expectedDef + 41.25, '兑换前包含其他收藏品防御增益');
    close(u.s.res, expectedRes, '整组兑换，零头不保留');
    const buff = h.b.addBuff(u, { key: 'test:conversion', mods: { defFlat: 100, resFlat: 2 } });
    close(u.s.def, id === BELL ? 0 : 431.25 + 700, '属性变化后重新兑换');
    close(u.s.res, id === BELL ? 22.5 : 0, '属性变化后的法抗');
    h.b.removeBuff(u, buff);
    installRelics(h.b);
    close(u.s.def, id === BELL ? 0 : 916.25, '移除临时增益并重复安装不叠加');
    close(u.s.res, expectedRes, '重复安装法抗稳定');
    h.b.dealDamage(null, u, { amount: 10000, type: 'true' });
    assert.ok(h.runUntil(() => u.alive, 2));
    close(u.s.def, id === BELL ? 0 : 916.25, '再部署防御稳定');
    close(u.s.res, expectedRes, '再部署法抗稳定');
    healthy(h);
  }
});

test('原创收藏品：同时持有清空防御法抗并在真实伤害管线减少物理及法术伤害90%', () => {
  for (const relics of [[BELL, SHIRT], [SHIRT, BELL, BELL]]) {
    const h = fight(relics, { defs: { chess: { r_guard: op('r_guard', 'WARRIOR', {
      stats: { maxHp: 10000, atk: 500, def: 275, res: 12.5, respawnTime: 0.5 },
    }) } } });
    h.step();
    const u = h.unit(1);
    close(u.s.def, 0, '组合移除全部防御');
    close(u.s.res, 0, '组合移除全部法抗');
    h.b.addBuff(u, { key: 'test:extra-defense', mods: { defFlat: 1000, defPct: 1, resFlat: 80 } });
    close(u.s.def, 0, '其他来源防御也全部移除');
    close(u.s.res, 0, '其他来源法抗也全部移除');
    for (const [type, expected] of [['phys', 100], ['arts', 100], ['true', 1000], ['elemental', 1000]]) {
      const hp = u.hp;
      h.b.dealDamage(null, u, { amount: 1000, type });
      close(hp - u.hp, expected, type);
    }
    h.b.dealDamage(null, u, { amount: 100000, type: 'true' });
    assert.ok(h.runUntil(() => u.alive, 2));
    close(u.s.def, 0, '再部署继续清空防御');
    close(u.s.res, 0, '再部署继续清空法抗');
    close(u.s.physTakenMul, 0.1, '再部署保持物理减伤');
    close(u.s.artsTakenMul, 0.1, '再部署保持法术减伤');
    healthy(h);
  }
});

test('原创收藏品：组合只按同一持有者计算，队友与召唤物不参与兑换', () => {
  const h = makeBattle({ kind: 'unite', defs: {
    chess: { r_guard: op('r_guard', 'WARRIOR', { stats: { maxHp: 2000, def: 275, res: 12 } }) },
    tokens: { r_token: { name: 'test', stats: { maxHp: 2000, def: 275, res: 12 }, rangeGrid: [[0, 0]], skill: null } },
  }, players: [
    player([BELL], [piece(), { uid: 3, kind: 'token', tokenId: 'r_token', ownerUid: 1, row: 10, col: 5 }]),
    player([SHIRT], [piece('r_guard', 2)], { playerId: 'p2', seat: 1, colOffset: 8 }),
  ], autoFinish: false });
  h.step();
  close(h.unit(1).s.def, 0, '本人金钟罩');
  close(h.unit(1).s.res, 17, '本人兑换');
  close(h.unit(2).s.def, 875, '队友铁布衫独立兑换');
  close(h.unit(2).s.res, 0, '队友法抗扣除');
  close(h.unit(3).s.def, 275, '召唤物不兑换');
  close(h.unit(3).s.res, 12, '召唤物不加法抗');
  healthy(h);
});

test('原创收藏品：零属性、不足整组、法抗边界均保持有效', () => {
  for (const [id, def, res, wantDef, wantRes] of [
    [BELL, 49, 0, 0, 0], [BELL, 0, 10, 0, 10], [BELL, 10000, 80, 0, 100],
    [SHIRT, 10, 0.5, 10, 0], [SHIRT, 0, 0, 0, 0], [SHIRT, 200, 150, 5200, 0],
  ]) {
    const h = fight([id], { defs: { chess: { r_guard: op('r_guard', 'WARRIOR', { stats: { maxHp: 2000, def, res } }) } } });
    h.step();
    close(h.unit(1).s.def, wantDef, '边界防御');
    close(h.unit(1).s.res, wantRes, '边界法抗');
    healthy(h);
  }
});

test('relics: trusted IDs give real operator attributes and damage; duplicate, unknown and client modifiers are ignored', () => {
  const h = fight([ATK, HP, DEF, PHYS, ATK, '__unknown__', { id: ATK, mods: { atkPct: 999 } }], {
    defs: {
      chess: { r_guard: op('r_guard') },
      enemies: { r_dummy: enemyRec({ key: 'r_dummy', hp: 1e7, speed: 0, def: 0, res: 0 }) },
    },
  });
  h.step();
  const u = h.unit(1);
  close(u.s.atk, 540, 'ATK +8%');
  close(u.s.maxHp, 2400, 'HP +20%');
  close(u.hp, 2400, 'initial deployment at full augmented HP');
  close(u.s.def, 230, 'DEF +15%');
  const enemy = h.spawn('r_dummy', { pos: [10, 5] });
  const before = enemy.hp;
  h.b.dealDamage(u, enemy, { amount: u.s.atk, type: 'phys' });
  close(before - enemy.hp, 540 * 1.3, 'the real damage pipeline applies the physical damage relic');
  assert.equal(u.buffs.filter((b) => b.key.startsWith('relic:')).length, 1);
  healthy(h);
});

test('relics: ownership, profession and kind isolate bonuses on a shared field', () => {
  const h = makeBattle({
    kind: 'unite',
    defs: {
      chess: { r_guard: op('r_guard'), r_medic: op('r_medic', 'MEDIC') },
      tokens: { r_token: { name: 'test summon', profession: 'WARRIOR', stats: { maxHp: 2000, atk: 500, def: 200 }, rangeGrid: [[0, 0]], skill: null } },
    },
    players: [
      player([ATK, GUARD_ATK], [piece(), piece('r_medic', 2, 11, 4), { uid: 3, kind: 'token', tokenId: 'r_token', ownerUid: 1, row: 10, col: 5 }]),
      player([], [piece('r_guard', 4, 10, 4)], { playerId: 'p2', seat: 1, colOffset: 8 }),
    ],
    autoFinish: false,
  });
  h.step();
  close(h.unit(1).s.atk, 665, 'the owner guard receives global +8% and guard +25%');
  close(h.unit(2).s.atk, 540, 'a different profession receives only the global bonus');
  close(h.unit(3).s.atk, 500, 'a summon receives no operator relic even with WARRIOR profession');
  close(h.unit(4).s.atk, 500, 'the other player receives no bonus');
  healthy(h);
});

test('relics: death, redeployment and repeated installation preserve one copy of each collection bonus', () => {
  const h = fight([ATK, HP, GUARD_ATK], { flags: { dpInit: 100, dpMax: 100 } });
  h.step();
  const u = h.unit(1);
  installRelics(h.b);
  close(u.s.atk, 665, 're-installation replaces the collection buff');
  for (let i = 0; i < 3; i++) {
    h.b.kill(u);
    assert.ok(!u.alive);
    close(u.s.atk, 665, 'the bonus survives death');
    assert.ok(h.runUntil(() => u.alive && u.deployed, 2), 'the operator redeploys');
    close(u.s.atk, 665, 'redeployment keeps the original attack bonus');
    close(u.s.maxHp, 2400, 'redeployment keeps the original max HP');
    close(u.hp, 2400, 'redeployment restores full augmented HP');
    assert.equal(u.buffs.filter((b) => b.key.startsWith('relic:')).length, 1);
    healthy(h);
  }
});

test('relics: melee and ranged bonuses use the actual deployment position', () => {
  const h = makeBattle({
    defs: { chess: {
      r_melee: op('r_melee', 'WARRIOR'),
      r_ranged: op('r_ranged', 'SNIPER'),
    } },
    players: [player(['relic_050'], [piece('r_melee'), piece('r_ranged', 2, 11, 4)])],
    autoFinish: false,
  });
  h.step();
  close(h.unit(1).s.atk, 600, 'melee operators receive the +20% bonus');
  close(h.unit(2).s.atk, 500, 'ranged operators receive no melee bonus');
  healthy(h);
});

test('relics: overlapping global, profession and position attack bonuses add without a collection cap', () => {
  const h = fight([ATK, GUARD_ATK, 'relic_052']);
  h.step();
  close(h.unit(1).s.atk, 840, '8% + 25% + 35% adds to 68%');
  healthy(h);
});

test('relics: normal-to-unite carry preserves the HP ratio without multiplying the collection again', () => {
  const relics = [ATK, HP, GUARD_ATK];
  const h = fight(relics);
  h.step();
  const initial = h.unit(1);
  initial.hp = initial.s.maxHp * 0.4;
  const carry = h.result().perPlayer.p1.unitsEnd[0];
  const g = fight(relics, { kind: 'unite', players: [player(relics, [{ ...piece(), carryState: { hpPct: carry.hpPct, sp: carry.sp, skillActive: carry.skillActive } }])] });
  g.step();
  const joined = g.unit(1);
  close(joined.s.atk, 665, 'a fresh shared-field battle receives the same bonus once');
  close(joined.s.maxHp, 2400, 'shared-field max HP stays equal');
  close(joined.hp, 960, 'the carried HP ratio uses augmented max HP');
  healthy(g);

  const down = fight(relics, { kind: 'unite', players: [player(relics, [{ ...piece(), carryState: { hpPct: 0, down: true } }])] });
  down.step();
  assert.ok(!down.unit(1).alive, 'a knocked-down carried operator is forced out at shared-field start');
  assert.ok(down.runUntil(() => down.unit(1).alive, 2));
  close(down.unit(1).s.atk, 665, 'forced-exit redeployment also retains one copy');
  close(down.unit(1).hp, 2400, 'forced-exit redeployment restores full HP');
  healthy(down);
});

test('relics: natural SP recovery affects time skills while attack recovery keeps its own rules', () => {
  const skill = (spType) => ({ spType, spCost: 1000, initSp: 0 });
  const h = makeBattle({
    defs: { chess: {
      r_time: op('r_time', 'WARRIOR', { skill: skill('INCREASE_WITH_TIME') }),
      r_attack: op('r_attack', 'WARRIOR', { skill: skill('INCREASE_WHEN_ATTACK') }),
    } },
    players: [player([SP], [piece('r_time'), piece('r_attack', 2, 11, 4)])],
    autoFinish: false,
  });
  h.run(10);
  close(h.unit(1).skill.sp, 11, 'natural recovery is 1.1 SP per second');
  close(h.unit(2).skill.sp, 0, 'attack recovery gets no passive time-based SP');
  healthy(h);
});

test('relics: passive regeneration scales from augmented max HP in the real tick loop', () => {
  const h = fight([HP, REGEN]);
  h.step();
  const u = h.unit(1);
  u.hp = 1000;
  h.run(1);
  close(u.hp, 1000 + 50 + 2400 * 0.02, '1 second heals 50 HP plus 2% of augmented max HP');
  healthy(h);
});

test('收藏品：固定回血与百分比回血完整相加，物理与法术伤害突破旧上限', () => {
  const h = fight(['relic_001', HP, REGEN, 'relic_041', 'relic_042', PHYS, 'relic_044', 'relic_045', 'relic_046'], {
    defs: {
      chess: { r_guard: op('r_guard') },
      enemies: { r_dummy: enemyRec({ key: 'r_dummy', hp: 1e7, speed: 0, def: 0, res: 0 }) },
    },
  });
  h.step();
  const u = h.unit(1);
  u.hp = 1000;
  h.run(1);
  close(u.hp, 1000 + 100 + 2400 * 0.02, '两件藏品的固定回血合计 100 点，与 2% 最大生命回血均完整生效');
  const enemy = h.spawn('r_dummy', { pos: [10, 5] });
  for (const type of ['phys', 'arts']) {
    const before = enemy.hp;
    h.b.dealDamage(u, enemy, { amount: 500, type });
    close(before - enemy.hp, 500 * 1.6, '10% + 20% + 30% 伤害增幅完整相加');
  }
  healthy(h);
});

test('relics: a JSON battle spec reconstructs the same bonuses and result on server and browser data sources', () => {
  const raw = {
    chess: { r_guard: op('r_guard') },
    enemies: { r_target: enemyRec({ key: 'r_target', hp: 1100, speed: 0, def: 0, res: 0 }) },
    stages: { relic_stage: flatStage({ id: 'relic_stage' }) },
  };
  const spec = buildBattleSpec({
    battleId: 'relic-test', fieldId: 'n:p1', kind: 'normal', seed: 77, stageId: 'relic_stage', round: 6,
    timeLimit: 20, players: [player([ATK, HP, PHYS, BELL, SHIRT])], routes: flatRoutes(),
    spawns: [{ time: 0, enemyKey: 'r_target', routeIndex: 0, pos: [10, 5] }],
  });
  const server = createBattleFromSpec(spec, new DataSource(raw, null), { quiet: true });
  const browser = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), new DataSource(JSON.parse(JSON.stringify(raw)), null), { quiet: true });
  server.step(); browser.step();
  close(server.allyUnits[0].s.atk, 540, 'server spec gives the bonus');
  close(browser.allyUnits[0].s.maxHp, 2400, 'browser spec gives the HP bonus');
  server.runToEnd(30); browser.runToEnd(30);
  assert.equal(server.result().killed, 1, 'the real operator defeats the target');
  assert.equal(resultDigest(server.result()).hash, resultDigest(browser.result()).hash);
  assert.deepEqual(server.errors, []);
  assert.deepEqual(browser.errors, []);
  checkInvariants(server); checkInvariants(browser);
});
