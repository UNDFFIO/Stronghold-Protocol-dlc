import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getData } from '../server/data.js';
import { GameData } from '../server/match/gamedata.js';
import { SharedPool } from '../server/match/pool.js';
import { computeBonds } from '../server/match/bondsMeta.js';
import { buildSpecialOperators, LIONHEART_ID, GOLDEN_VOW_ID } from '../shared/specialOperators.js';
import { makeBattle, chessRec, enemyRec, checkInvariants } from './helpers/battleHarness.js';
import { makeMatch, give } from './match/harness.js';
import { chessAvatarUrl, chessPortraitUrl } from '../public/js/ui/assetUrls.js';
import { spineEntry } from '../public/js/assets.js';
import { validateData } from '../shared/plugins/validate.js';
import { COLS } from '../server/sim/constants.js';
import { placementContext, canPlace } from '../public/js/ui/gameLogic/placement.js';
import { underframeActions } from '../public/js/ui/facing.js';
import { applyRecordOverlay } from '../shared/i18nData.js';
import { readFileSync } from 'node:fs';
import { sortAllyTargets } from '../server/sim/targeting.js';

const data = getData();
const king = data.chess[LIONHEART_ID];

test('content-set validation accepts the special operator while enforcing its acquisition and promotion limits', () => {
  assert.deepEqual(validateData(data), []);
  for (const patch of [{ visible: true }, { isHidden: false }, { goldenId: LIONHEART_ID }, { upgradeNum: 3 }]) {
    const changed = { ...data, chess: { ...data.chess, [LIONHEART_ID]: { ...king, ...patch } } };
    assert.ok(validateData(changed).some((p) => p.code === 'PLUGIN_DATA_PAIR'));
  }
});

test('Lionheart reuses the ordinary Golden Vow stats and art without altering the source summon', () => {
  const before = JSON.stringify(data.tokens[GOLDEN_VOW_ID]);
  const built = buildSpecialOperators(data.chess, data.tokens)[LIONHEART_ID];
  assert.deepEqual(king, built);
  assert.deepEqual(king.stats, data.tokens[GOLDEN_VOW_ID].variants.chess_char_6_07_a.stats);
  assert.deepEqual([king.stats.maxHp, king.stats.atk, king.stats.def], [4000, 425, 270]);
  assert.equal(king.skill, null);
  assert.equal(king.goldenId, null);
  assert.equal(king.assets.spine, GOLDEN_VOW_ID);
  assert.equal(JSON.stringify(data.tokens[GOLDEN_VOW_ID]), before);
  assert.ok(chessAvatarUrl(data.assets, king));
  assert.ok(chessPortraitUrl(data.assets, king));
  assert.ok(spineEntry(data.assets, king.assets.spine)?.skel);
});

test('Lionheart is excluded from the shop, random rewards and every generated acquisition pool', () => {
  const gd = new GameData(data, 'mode_multi_normal');
  assert.ok(!gd.visibleChess.includes(LIONHEART_ID));
  assert.ok(!new SharedPool(gd).has(LIONHEART_ID));
  assert.ok(!JSON.stringify(data.choices.pools).includes(LIONHEART_ID));
  assert.ok(!JSON.stringify(data.backups.diy).includes(king.charId));
  const h = makeMatch({ mode: 'solo', fake: true });
  h.start();
  assert.ok(h.drive(() => h.m.phase === 'PREP', { ready: false }));
  const ps = h.ps('p_0');
  for (let tier = 1; tier <= 6; tier++) {
    const offer = ps.pushRewardOffer('merge', { tier });
    assert.ok(offer.slots.every((slot) => slot.id !== LIONHEART_ID));
  }
  const before = computeBonds(h.m.gd, ps).victoriaShip?.count ?? 0;
  give(h.m, ps, LIONHEART_ID, 'board', [10, 4]);
  assert.equal(computeBonds(h.m.gd, ps).victoriaShip.count, before + 1);
  assert.deepEqual(h.m.gd.chess(LIONHEART_ID).bonds, ['victoriaShip']);
  assert.equal(h.m.gd.goldenIdOf(LIONHEART_ID), null);
});

test('Lionheart has the pictured 13-tile attack range in every deployment direction', () => {
  const picture = ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'];
  const expected = new Set();
  for (let r = 0; r < picture.length; r++) for (let c = 0; c < picture[r].length; c++) {
    if (picture[r][c] === 'X') expected.add((10 + r - 2) * COLS + 4 + c - 2);
  }
  for (const dir of ['UP', 'RIGHT', 'DOWN', 'LEFT']) {
    const h = makeBattle({ units: [{ chessId: LIONHEART_ID, row: 10, col: 4, dir }] });
    h.step(1);
    assert.deepEqual(new Set(h.unit(LIONHEART_ID).rangeKeys), expected, dir);
  }
});

test('Lionheart deploys as an independent operator and keeps dealing true damage without Vina', () => {
  const types = [];
  const h = makeBattle({
    units: [{ chessId: LIONHEART_ID, row: 10, col: 4 }],
    defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, def: 5000, atk: 0, speed: 0 }) } },
    enemies: [{ key: 'enemy_dummy', pos: [10, 4] }], autoFinish: false, timeLimit: 40,
    setup: (b) => b.on('damaged', (c) => { if (c.source?.defId === LIONHEART_ID) types.push(c.type); }),
  });
  h.run(30);
  const unit = h.unit(LIONHEART_ID);
  assert.equal(unit.kind, 'op');
  assert.equal(unit.profile.dmgType, 'true');
  assert.equal(unit.skill.noSkill, true);
  assert.equal(unit.skill.activations, 0);
  assert.ok(unit.alive && unit.deployed);
  assert.ok(types.length >= 5);
  assert.deepEqual([...new Set(types)], ['true']);
  checkInvariants(h.b);
});

test('Lionheart cannot be sold, can deploy at the cap, and cannot be swapped out to evade the cap', () => {
  const h = makeMatch({ mode: 'solo', fake: true });
  h.start();
  assert.ok(h.drive(() => h.m.phase === 'PREP', { ready: false }));
  const ps = h.ps('p_0');
  const ordinary = 'chess_char_1_02_a';
  give(h.m, ps, ordinary, 'board', [9, 3]);
  ps.deployCapBonus = 1 - h.m.gd.deployCap;
  const p = give(h.m, ps, LIONHEART_ID);
  const other = give(h.m, ps, ordinary);
  const funds = ps.funds;
  assert.equal(ps.sell(p.uid).error, 'BAD_TARGET');
  assert.equal(ps.find(p.uid).piece, p);
  assert.equal(ps.funds, funds);
  const getChess = (id) => data.chess[id];
  const stage = data.stages.act2autochess_m01;
  const priv = { board: [{ uid: 100, id: ordinary, kind: 'chess', row: 9, col: 3 }],
    hand: [p, other], deployCap: 1, deployCount: 1 };
  let ctx = placementContext({ priv, stage, editable: true, getChess });
  assert.equal(canPlace(ctx, p.uid, { area: 'board', row: 9, col: 4 }).ok, true);
  assert.equal(underframeActions(ctx, p.uid).sell, null);
  assert.equal(ps.move(p.uid, { area: 'board', row: 9, col: 4 }).ok, true);
  assert.equal(ps.deployCount, 1);
  assert.equal(ps.sell(p.uid).error, 'BAD_TARGET');
  assert.equal(ps.move(other.uid, { area: 'board', row: 9, col: 4 }).error, 'BOARD_FULL');
  priv.board.push({ ...p, row: 9, col: 4 });
  priv.hand = [other];
  delete priv.deployCount; // the browser's fallback count also excludes the special operator
  ctx = placementContext({ priv, stage, editable: true, getChess });
  assert.equal(ctx.count, 1);
  assert.equal(canPlace(ctx, other.uid, { area: 'board', row: 9, col: 4 }).ok, false);
});

const ranged = chessRec({ id: 'test_ranged', profession: 'SNIPER', skill: null, stats: { blockCnt: 2, atk: 0 }, bonds: ['victoriaShip'] });
const guard = chessRec({ id: 'test_guard', skill: null, stats: { blockCnt: 3, atk: 0 } });
function traitBattle(extra = {}) {
  return makeBattle({
    units: [{ chessId: LIONHEART_ID, row: 10, col: 4 }, { chessId: 'test_ranged', row: 10, col: 7 },
      { chessId: 'test_guard', row: 11, col: 7 }],
    defs: { chess: { test_ranged: ranged, test_guard: guard },
      enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, atk: 0, speed: 0 }) } },
    autoFinish: false, timeLimit: 90, ...extra,
  });
}

/** A moving dummy at (10, 6) for the 王威 slow: inside the king's range, six-person Victoria bond by default. */
function slowBattle(opts = {}) {
  return makeBattle({
    units: [{ chessId: LIONHEART_ID, row: 10, col: 4 }],
    defs: { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, atk: 0, speed: 1 }) } },
    enemies: [{ key: 'enemy_dummy', pos: [10, 6] }],
    bonds: { victoriaShip: { count: 6, active: true, tier: 2, layers: 0 } },
    autoFinish: false, timeLimit: 60, ...opts,
  });
}

test('Lionheart gains one additive percent max HP and DEF per Victoria layer, without compounding', () => {
  for (const layers of [0, 1, 30, 100, 999]) {
    const h = traitBattle({ bonds: { victoriaShip: { count: 3, active: true, tier: 1, layers } } }).step();
    const k = h.unit(LIONHEART_ID);
    const ratio = 1 + layers / 100;
    assert.ok(Math.abs(k.s.maxHp - 4000 * ratio) < 1e-8, `${layers}: max HP`);
    assert.ok(Math.abs(k.s.def - 270 * ratio) < 1e-8, `${layers}: DEF`);
    assert.equal(k.hp, k.s.maxHp, 'initial deployment has full scaled HP');
    assert.equal(k.s.atk, 425);
    h.run(2);
    assert.ok(Math.abs(k.s.maxHp - 4000 * ratio) < 1e-8, 'repeated refreshes do not reapply the same layers');
    assert.equal(k.base.maxHp, 4000);
    assert.equal(k.base.def, 270);
    checkInvariants(h.b);
  }
});

test('live Victoria layer gains update both stats, add to other bonuses and preserve the HP ratio', () => {
  const h = traitBattle({ bonds: { victoriaShip: { count: 3, active: true, tier: 1, layers: 10 } } }).step();
  const k = h.unit(LIONHEART_ID);
  h.b.addBuff(k, { key: 'test:other-stats', mods: { hpPct: 0.2, defPct: 0.4 } });
  k.hp = k.s.maxHp / 2;
  assert.equal(h.b.addLayers(k.ownerId, 'victoriaShip', 20), 20);
  h.step();
  assert.ok(Math.abs(k.s.maxHp - 6000) < 1e-8);
  assert.ok(Math.abs(k.s.def - 459) < 1e-8);
  assert.ok(Math.abs(k.hp - 3000) < 1e-8);
  h.b.getPlayer(k.ownerId).bonds.victoriaShip.layers = 5;
  h.step();
  assert.ok(Math.abs(k.s.maxHp - 5000) < 1e-8, 'the current layer total replaces the previous bonus');
  assert.ok(Math.abs(k.s.def - 391.5) < 1e-8);
  assert.ok(Math.abs(k.hp - 2500) < 1e-8);
  checkInvariants(h.b);
});

test('each Lionheart reads its own player\'s Victoria layers on a shared field', () => {
  const h = traitBattle({ players: [
    { playerId: 'p1', units: [{ uid: 1, chessId: LIONHEART_ID, row: 10, col: 4 }],
      bonds: { victoriaShip: { count: 3, active: true, tier: 1, layers: 10 } } },
    { playerId: 'p2', units: [{ uid: 2, chessId: LIONHEART_ID, row: 10, col: 7 }],
      bonds: { victoriaShip: { count: 3, active: true, tier: 1, layers: 80 } } },
  ] }).step();
  const first = h.allies().find((u) => u.ownerId === 'p1');
  const second = h.allies().find((u) => u.ownerId === 'p2');
  assert.deepEqual([first.s.maxHp, second.s.maxHp], [4400, 7200]);
  assert.deepEqual([first.s.def, second.s.def], [297, 486]);
  checkInvariants(h.b);
});

test('revival pauses Victoria stat growth and restores full HP at the latest layer total', () => {
  const h = traitBattle({ bonds: { victoriaShip: { count: 3, active: true, tier: 1, layers: 30 } } }).step();
  const k = h.unit(LIONHEART_ID), r = h.unit('test_ranged');
  assert.equal(k.s.maxHp, 5200);
  h.b.dealHPLose({ source: null, target: k, amount: 1e6 });
  assert.equal(k.hp, 1);
  assert.deepEqual([k.s.maxHp, k.s.def, k.s.blockCnt, r.s.blockCnt], [4000, 270, 0, 0]);
  h.b.addLayers(k.ownerId, 'victoriaShip', 10);
  h.step();
  assert.deepEqual([k.s.maxHp, k.s.def, k.hp], [4000, 270, 1]);
  h.run(25.1);
  assert.deepEqual([k.s.maxHp, k.s.def, k.hp, k.s.blockCnt], [5600, 378, 5600, 3]);
  checkInvariants(h.b);
});

test('Lionheart transfers live Ranged-position block bonuses and releases the aura on withdrawal', () => {
  const h = traitBattle().step();
  const k = h.unit(LIONHEART_ID), r = h.unit('test_ranged'), g = h.unit('test_guard');
  assert.equal(r.s.blockCnt, 0);
  assert.equal(k.s.blockCnt, 3);
  assert.equal(g.s.blockCnt, 3);
  h.b.addBuff(r, { key: 'test:extra-block', mods: { blockCnt: 3 } });
  assert.equal(r.s.blockCnt, 0, 'later bonuses cannot override the suppression');
  h.step();
  assert.equal(k.s.blockCnt, 6);
  h.b.removeBuff(r, 'test:extra-block');
  h.step();
  assert.equal(k.s.blockCnt, 3);
  h.b.retreat(r);
  assert.equal(k.s.blockCnt, 1, 'withdrawn allies no longer lend block');
  h.step(); // the synthetic ranged operator has a redeploy timer
  h.b.retreat(k);
  h.b._deploy(r);
  assert.equal(r.s.blockCnt, 2, 'no king on the field: ordinary block returns');
  checkInvariants(h.b);
});

test('only actual healing of allied Victoria operators restores half as much HP to Lionheart', () => {
  const h = traitBattle().step();
  const k = h.unit(LIONHEART_ID), r = h.unit('test_ranged'), g = h.unit('test_guard');
  k.hp = 1000;
  assert.equal(h.b.heal({ source: r, target: k, amount: 500 }), 0);
  assert.equal(h.b.heal({ source: k, target: k, amount: 500 }), 0);
  r.hp = r.s.maxHp - 100;
  assert.equal(h.b.heal({ source: g, target: r, amount: 1000 }), 100);
  assert.equal(k.hp, 1050, 'overhealing is excluded');
  h.b.heal({ source: g, target: r, amount: 1000 });
  assert.equal(k.hp, 1050, 'a full-health recipient supplies no healing');
  g.hp -= 500;
  h.b.heal({ source: r, target: g, amount: 500 });
  assert.equal(k.hp, 1050, 'non-Victoria healing supplies none');
  r.hp -= 100;
  h.b.heal({ source: r, target: r, amount: 100, mode: 'regen' });
  assert.equal(k.hp, 1050, 'regeneration is not healing');
  h.b.addBuff(r, { key: 'test:healing', mods: { healingTakenMul: 2 } });
  r.hp -= 400;
  h.b.heal({ source: g, target: r, amount: 200 });
  assert.equal(k.hp, 1250, 'the actual post-modifier healing is shared once');
  g.items = ['chess_item_6_09_e_a', 'chess_item_1_01_e_a']; // 变形同构体 + 维式重锤 grants Victoria
  g.hp -= 100;
  h.b.heal({ source: r, target: g, amount: 100 });
  assert.equal(k.hp, 1300, 'equipment-granted Victoria membership also counts');
  checkInvariants(h.b);
});

test('multiple Lionhearts do not duplicate removed block or create healing loops', () => {
  const h = traitBattle({ units: [{ chessId: LIONHEART_ID, uid: 1, row: 10, col: 4 },
    { chessId: LIONHEART_ID, uid: 2, row: 11, col: 4 }, { chessId: 'test_ranged', uid: 3, row: 10, col: 7 }] }).step();
  const [first, second] = h.allies().filter((u) => u.defId === LIONHEART_ID);
  const r = h.unit('test_ranged');
  assert.deepEqual([first.s.blockCnt, second.s.blockCnt, r.s.blockCnt], [3, 1, 0]);
  first.hp = second.hp = 1000;
  r.hp -= 100;
  h.b.heal({ source: r, target: r, amount: 100 });
  assert.deepEqual([first.hp, second.hp], [1050, 1050]);
  h.b.dealHPLose({ source: null, target: first, amount: 1e6 });
  assert.deepEqual([first.s.blockCnt, second.s.blockCnt, r.s.blockCnt], [0, 3, 0]);
  checkInvariants(h.b);
});

for (const [roll, status, duration] of [[0, 'stun', 0.6], [1, 'cold', 2], [2, 'bind', 0.7],
  [3, 'sluggish', 1], [4, 'silence', 10], [5, 'palsy', Infinity]]) {
  test(`Lionheart's one-second aura rolls ${status} through the status catalogue`, () => {
    const seen = [];
    const h = traitBattle({ enemies: [{ key: 'enemy_dummy', pos: [10, 6] }],
      setup: (b) => b.on('beforeStatus', (c) => { if (c.source?.defId === LIONHEART_ID) seen.push({ ...c }); }) });
    h.b.rng.int = () => roll;
    h.run(0.9);
    assert.equal(seen.length, 0);
    h.run(0.2);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].status, status);
    assert.equal(seen[0].duration, duration);
    if (status === 'palsy') assert.equal(h.enemy('enemy_dummy').findBuff('palsy').stacks, 1);
    h.run(1);
    assert.equal(seen.filter((c) => c.status === status).length, 2);
    if (status === 'cold') assert.ok(h.enemy('enemy_dummy').s.flags.freeze, 'a second Cold applies Freeze');
    checkInvariants(h.b);
  });
}

test('each enemy has its own timer and random roll; leaving the range resets its one-second timer', () => {
  const applied = [];
  const h = traitBattle({ enemies: [{ key: 'enemy_dummy', count: 2, interval: 0, pos: [10, 6] }],
    setup: (b) => b.on('beforeStatus', (c) => { if (c.source?.defId === LIONHEART_ID) applied.push(c.status); }) });
  let n = 0;
  h.b.rng.int = () => n++ % 2;
  h.run(1.1);
  assert.deepEqual(applied, ['stun', 'cold']);
  const e = h.enemies()[0];
  e.x = 9;
  h.step();
  e.x = 6;
  h.run(0.8);
  assert.equal(applied.length, 2);
  h.run(0.3);
  assert.equal(applied.length, 4);
});

test('the aura respects status immunity without rerolling the blocked effect', () => {
  const h = traitBattle({ enemies: [{ key: 'enemy_dummy', pos: [10, 6] }] }).step();
  const e = h.enemy('enemy_dummy');
  e.def.immune.add('stun');
  let rolls = 0;
  h.b.rng.int = () => { rolls++; return 0; };
  h.run(1.1);
  assert.equal(rolls, 1);
  assert.ok(!e.s.flags.stun);
  assert.equal(e.buffs.filter((b) => b.source === h.unit(LIONHEART_ID)).length, 0);
});

for (const count of [5, 6]) test(`range exit attracts enemies only with the active 6-person Victoria bond (${count})`, () => {
  const h = traitBattle({ bonds: { victoriaShip: { count, active: true, tier: count === 6 ? 2 : 1, layers: 0 } },
    enemies: [{ key: 'enemy_dummy', pos: [10, 6] }] }).step();
  const e = h.enemy('enemy_dummy');
  e.x = 7;
  h.step();
  const lure = e.findBuff('attract');
  assert.equal(!!lure, count === 6);
  if (lure) {
    assert.equal(lure.duration, 10);
    assert.deepEqual([lure.data.attract.r, lure.data.attract.c], [10, 4]);
    h.run(9.8);
    assert.ok(e.findBuff('attract'), 'attraction remains active beyond the old three-second duration');
    h.run(0.3);
    assert.equal(e.findBuff('attract'), null, 'attraction expires after ten seconds');
  }
});

test('the six-person Victoria bond slows enemies in range by 30%, and an attracted enemy is exempt', () => {
  const h = slowBattle().step();
  h.b.rng.int = () => 4; // always the control aura's silence roll: it never changes move speed
  const e = h.enemy('enemy_dummy'), k = h.unit(LIONHEART_ID);
  h.b.addBuff(e, { key: 'test:hold', flags: { noMove: true } });
  assert.equal(e.s.moveSpeed, 1);
  h.run(0.3);
  assert.ok(Math.abs(e.s.moveSpeed - 0.7) < 1e-9, 'in range: -30% move speed');
  assert.equal(e.findBuff('lionheart:slow')?.source, k);
  h.b.applyStatus(e, 'attract', { duration: 5, source: k, point: [10, 4] });
  assert.ok(!e.findBuff('lionheart:slow'), 'the running slow is dropped at once');
  h.step();
  assert.equal(e.s.moveSpeed, 1, 'an attracted enemy keeps its own speed');
  h.run(0.5);
  assert.equal(e.s.moveSpeed, 1, 'the aura does not reapply while the attraction lasts');
  h.b.removeStatus(e, 'attract');
  h.run(0.3);
  assert.ok(Math.abs(e.s.moveSpeed - 0.7) < 1e-9, 'the aura resumes after the attraction ends');
  checkInvariants(h.b);
});

test('the range slow needs the active six-person bond and lapses after leaving the range', () => {
  for (const count of [0, 5, 6]) {
    const h = slowBattle({ bonds: { victoriaShip: { count, active: true, tier: count >= 6 ? 2 : 1, layers: 0 } } }).step();
    const e = h.enemy('enemy_dummy');
    h.b.addBuff(e, { key: 'test:hold', flags: { noMove: true } });
    h.run(0.3);
    assert.ok(Math.abs(e.s.moveSpeed - (count === 6 ? 0.7 : 1)) < 1e-9, `Victoria members: ${count}`);
    if (count !== 6) continue;
    e.x = 9; // outside the 13-tile diamond
    h.run(0.5);
    assert.equal(e.s.moveSpeed, 1, 'no slow outside the range');
  }
});

test('the range slow pauses during the 25-second revival and resumes afterwards', () => {
  const h = slowBattle().step();
  h.b.rng.int = () => 4; // the control aura rolls only silence: no extra movement-speed modifier
  const k = h.unit(LIONHEART_ID), e = h.enemy('enemy_dummy');
  h.b.addBuff(e, { key: 'test:hold', flags: { noMove: true } });
  h.run(0.3);
  assert.ok(Math.abs(e.s.moveSpeed - 0.7) < 1e-9);
  h.b.dealHPLose({ source: null, target: k, amount: 1e6 });
  assert.equal(k.hp, 1);
  h.run(0.4);
  assert.equal(e.s.moveSpeed, 1, 'the aura is paused while the king recovers');
  h.run(25);
  assert.equal(k.hp, k.s.maxHp);
  assert.ok(Math.abs(e.s.moveSpeed - 0.7) < 1e-9, 'the aura resumes with the latest state');
  checkInvariants(h.b);
});

test('two Lionhearts refresh one shared slow instead of stacking it', () => {
  const h = slowBattle({ units: [{ chessId: LIONHEART_ID, uid: 1, row: 10, col: 4 },
    { chessId: LIONHEART_ID, uid: 2, row: 11, col: 4 }] }).step();
  const e = h.enemy('enemy_dummy');
  h.b.addBuff(e, { key: 'test:hold', flags: { noMove: true } });
  h.run(0.3);
  assert.ok(Math.abs(e.s.moveSpeed - 0.7) < 1e-9, 'not 0.49: the shared slow does not stack');
  checkInvariants(h.b);
});

test('fatal damage starts a repeatable 25-second on-field revival and pauses active traits only', () => {
  const statuses = [];
  const h = traitBattle({ enemies: [{ key: 'enemy_dummy', pos: [10, 6] }],
    bonds: { victoriaShip: { count: 6, active: true, tier: 2, layers: 0 } },
    setup: (b) => b.on('beforeStatus', (c) => { if (c.source?.defId === LIONHEART_ID) statuses.push(c.status); }) }).step();
  const k = h.unit(LIONHEART_ID), r = h.unit('test_ranged');
  const seq = k.deploySeq, attacks = k.stats.attacks;
  h.b.dealDamage({ source: h.enemy('enemy_dummy'), target: k, amount: 1e6, type: 'true' });
  assert.ok(k.alive && k.deployed);
  assert.equal(k.hp, 1);
  assert.equal(k.s.blockCnt, 0);
  assert.equal(k.canAct, true, 'recovery does not stun the king');
  assert.equal(!!k.s.flags.stun, false);
  assert.ok(k.s.flags.invulnerable && k.s.flags.disarm);
  assert.equal(r.s.blockCnt, 0);
  assert.equal(h.b.dealDamage({ source: null, target: k, amount: 500, type: 'true' }), 0);
  r.hp -= 100;
  h.b.heal({ source: r, target: r, amount: 100 });
  assert.equal(k.hp, 1);
  h.run(24.9);
  assert.equal(k.hp, 1);
  assert.equal(k.stats.attacks, attacks);
  assert.deepEqual(statuses, []);
  assert.equal(r.s.blockCnt, 0, 'ranged block stays suppressed throughout recovery');
  h.run(0.2);
  assert.equal(k.hp, k.s.maxHp);
  assert.equal(k.s.blockCnt, 3);
  assert.equal(k.deploySeq, seq, 'no retreat or redeployment');
  assert.equal(k.s.flags.invulnerable, undefined);
  assert.equal(k.s.flags.disarm, undefined);
  h.run(3);
  assert.ok(statuses.length > 0);
  assert.ok(k.stats.attacks > attacks);
  h.b.dealHPLose({ source: null, target: k, amount: 1e6 });
  assert.equal(k.hp, 1);
  assert.equal(k.canAct, true);
  assert.ok(k.s.flags.disarm);
  h.run(25.1);
  assert.equal(k.hp, k.s.maxHp);
  assert.equal(k.deploySeq, seq);
  assert.equal(h.hooks.death.filter((c) => c.unit === k).length, 0);
  checkInvariants(h.b);
});

test('recovery lowers enemy targeting priority by one taunt level until revival', () => {
  const h = traitBattle({ enemies: [{ key: 'enemy_dummy', pos: [10, 6] }] }).step();
  const k = h.unit(LIONHEART_ID), r = h.unit('test_ranged'), e = h.enemy('enemy_dummy');
  // Make the king the latest deployment, so its ordinary priority wins the initial tie.
  k.aggroSeq = r.aggroSeq + 1;
  const before = k.s.taunt;
  assert.equal(sortAllyTargets(e, [r, k])[0], k);
  h.b.dealHPLose({ source: null, target: k, amount: 1e6 });
  assert.equal(k.s.taunt, before - 1);
  assert.equal(sortAllyTargets(e, [k, r])[0], r);
  assert.equal(sortAllyTargets(e, [k])[0], k, 'still targetable when no higher-priority ally is available');
  h.run(25.1);
  assert.equal(k.s.taunt, before);
  assert.equal(sortAllyTargets(e, [r, k])[0], k);
  checkInvariants(h.b);
});

test('all four data overlays translate the new trait and talents without stale leaves', () => {
  for (const lang of ['en', 'zh-TW', 'ja', 'ko']) {
    const overlay = JSON.parse(readFileSync(new URL(`../data/i18n/${lang}.json`, import.meta.url), 'utf8'));
    const result = applyRecordOverlay(king, overlay.files.chess[LIONHEART_ID]);
    assert.equal(result.stale, 0, lang);
    assert.notEqual(result.value.trait.desc, king.trait.desc, lang);
    assert.ok(result.value.talents.every((t, i) => t.desc !== king.talents[i].desc), lang);
  }
});
