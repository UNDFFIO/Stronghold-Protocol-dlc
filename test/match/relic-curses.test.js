import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give } from './harness.js';
import { grantRelic, settleRelicLayerLosses } from '../../server/match/relics.js';
import { roadEnemyKey, withRoadEnemies } from '../../server/match/relicRoad.js';
import { RELICS, getRelic, pickRelic } from '../../shared/relics.js';
import { createRng } from '../../server/sim/rng.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { install as installRelics } from '../../server/sim/content/relics.js';
import { compactResult, resultDigest, buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { requiresTraitLayerAuthority } from '../../server/match/operatorTraits.js';
import { bondsWithGains } from '../../server/match/bondsMeta.js';
import { PHASE } from '../../shared/constants.js';

test('four official curses: direct acquisition and duplicate protection, never ordinary or forced tier-six drops', () => {
  for (const id of ['relic_227', 'relic_228', 'relic_219', 'relic_220']) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(1); const ps = h.ps('p_0');
      assert.equal(getRelic(id).tier, 6);
      assert.equal(grantRelic(ps, id)?.id, id);
      assert.equal(grantRelic(ps, id), null);
      assert.ok(ps.privateView().relics.some((r) => r.id === id));
      assert.equal(pickRelic(20, [], createRng(2), { tierWeights: [0, 0, 0, 0, 0, 100] }), null);
    } finally { h.m.dispose(); }
  }
});

test('recollection instrument destroys both reserve areas and attached equipment, preserves board/teammate and loses exactly seven old relics', () => {
  const run = () => {
    const h = makeMatch({ humans: 2, fake: true }).start();
    try {
      h.toPrep(1); const ps = h.ps('p_0'), mate = h.ps('p_1');
      const old = RELICS.filter((r) => r.tier < 6 && !r.requiredBond && !r.scratchTicket && !r.fallbackOnly).slice(0, 10);
      ps.relics = old.map((r) => ({ id: r.id, round: 1 }));
      const reserve = ps.newPiece('chess', 'chess_char_1_01_a', { items: [ps.newPiece('item', 'test')] });
      ps.hand[0] = reserve;
      ps.temp[8] = ps.newPiece('item', 'test');
      const deployed = [...ps.board.values()];
      const funds = ps.funds, mateView = JSON.stringify(mate.privateView());
      assert.ok(grantRelic(ps, 'relic_219'));
      assert.ok(ps.hand.every((p) => !p || !['chess', 'item'].includes(p.kind)));
      assert.ok(ps.temp.every((p) => !p || !['chess', 'item'].includes(p.kind)));
      assert.deepEqual([...ps.board.values()], deployed);
      assert.equal(ps.funds, funds);
      assert.equal(JSON.stringify(mate.privateView()), mateView);
      assert.equal(ps.relics.length, 4);
      assert.ok(ps.relics.some((r) => r.id === 'relic_219'));
      assert.equal(grantRelic(ps, 'relic_219'), null);
      return ps.relics;
    } finally { h.m.dispose(); }
  };
  assert.deepEqual(run(), run(), 'independent seeded loss stream');
});

test('road network: exactly 50% extra, fixed absent faction, holder isolation, preview idempotence, no bounty replication', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'), mate = h.ps('p_1'), m = h.m;
    const count = (spawns) => spawns.reduce((n, s) => n + Math.max(1, s.count || 1), 0);
    const before = m._normalOpts(ps).spawns, teammate = m._normalOpts(mate).spawns;
    grantRelic(ps, 'relic_228');
    const key = roadEnemyKey(m, ps);
    assert.ok(key);
    const entries = Object.values(m.gd.factions.entries);
    assert.ok(entries.filter((e) => e.key === key).every((e) => !m.factions.includes(e.type) && e.type !== 'SPECIAL'));
    const after = m._normalOpts(ps).spawns;
    assert.equal(count(after) - count(before), Math.ceil(count(m.wave.spawns) / 2));
    assert.equal(after.filter((s) => s.enemyKey === key).length, Math.ceil(count(m.wave.spawns) / 2));
    assert.deepEqual(m._normalOpts(ps).spawns, after);
    assert.deepEqual(m._normalOpts(ps, { preview: true }).spawns, after);
    assert.deepEqual(m._normalOpts(mate).spawns, teammate);
    const routes = [{ start: [2, 10], end: [2, 2] }, { start: [2, 10], end: [2, 18] }];
    const original = [{ enemyKey: 'base', count: 5, routeIndex: 0 }, { enemyKey: 'base', count: 4, routeIndex: 1 },
      { enemyKey: 'bounty', count: 9, routeIndex: 0, bounty: { coins: 5 } }];
    const boss = withRoadEnemies(m, ps, original, routes, { side: 'L' });
    assert.equal(count(boss) - count(original), 3);
    assert.ok(boss.slice(original.length).every((s) => s.enemyKey === key && s.ownerPlayerId === ps.playerId && s.routeIndex === 0 && !s.bounty && !s.tag));
    const b = createBattleFromSpec(buildBattleSpec(m._normalOpts(ps)), m.ds);
    assert.equal(b.total, count(after));
    assert.deepEqual(b.errors, []);
  } finally { h.m.dispose(); }
});

test('road network: real paired boss preview matches the holder’s actual half and leaves the teammate’s half unchanged', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const m = h.m, ps = h.ps('p_0'), mate = h.ps('p_1');
    grantRelic(ps, 'relic_228');
    m.startRound(m.gd.bossRound);
    const g = m.bossGroupOf(ps), key = roadEnemyKey(m, ps);
    const baseline = g.wave.spawns.filter((s) => g.wave.routes[s.routeIndex ?? 0]?.end?.[1] < 10)
      .reduce((n, s) => n + Math.max(1, s.count || 1), 0);
    const preview = m.nextEnemiesFor(ps).filter((s) => s.enemyKey === key);
    assert.equal(preview.reduce((n, s) => n + s.count, 0), Math.ceil(baseline / 2));
    assert.ok(!m.nextEnemiesFor(mate).some((s) => s.enemyKey === key));
    m.startFinalAssault(false);
    const actual = m.fields[0].battle.opts.spawns.filter((s) => s.enemyKey === key);
    assert.equal(actual.length, Math.ceil(baseline / 2));
    assert.ok(actual.every((s) => g.wave.routes[s.routeIndex].end[1] < 10 && s.ownerPlayerId === ps.playerId));
  } finally { h.m.dispose(); }
});

test('recollection instrument returns real shared chess copies and clears item debt without any sale income', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const m = h.m, ps = h.ps('p_0');
    const id = [...m.pool.entries.keys()].find((id) => m.pool.left(id) > 0);
    const before = m.pool.left(id);
    const reserve = give(m, ps, id);
    const itemId = Object.keys(m.gd.raw.items).find((id) => m.itemPool.cap(id) != null && !m.gd.isGolden(id));
    assert.ok(itemId);
    reserve.items.push(ps.newPiece('item', itemId));
    m.itemPool.owe(itemId, 1);
    assert.equal(m.pool.left(id), before - 1); assert.equal(m.itemPool.debtOf(itemId), 1);
    const funds = ps.funds;
    grantRelic(ps, 'relic_219');
    assert.equal(m.pool.left(id), before); assert.equal(m.itemPool.debtOf(itemId), 0);
    assert.equal(ps.funds, funds);
  } finally { h.m.dispose(); }
});

test('little grinder: one active bond loses 20 each full second, no underflow, teammate/inactive isolation, repeat installation', () => {
  const bonds = { sargonShip: { active: true, count: 3, tier: 1, layers: 45 },
    victoriaShip: { active: false, count: 0, tier: 0, layers: 90 } };
  for (const kind of ['normal', 'unite', 'boss', 'hidden']) {
    const f = makeBattle({ kind, autoFinish: false, flags: { layerGainsEnabled: kind === 'normal' },
      players: [{ playerId: 'p1', units: [], bonds, relics: ['relic_220', 'relic_220'] },
        { playerId: 'p2', units: [], bonds }] });
    installRelics(f.b); installRelics(f.b);
    f.run(0.9); assert.equal(f.b.getPlayer('p1').bonds.sargonShip.layers, 45);
    f.run(0.2); assert.equal(f.b.getPlayer('p1').bonds.sargonShip.layers, 25);
    f.run(2); assert.equal(f.b.getPlayer('p1').bonds.sargonShip.layers, 0);
    assert.equal(f.b.getPlayer('p1').bonds.victoriaShip.layers, 90);
    assert.equal(f.b.getPlayer('p2').bonds.sargonShip.layers, 45);
    assert.equal(f.b._pp('p1').layerGains.sargonShip, -45);
    assert.equal(bonds.sargonShip.layers, 45, 'battle input immutable');
    assert.equal(compactResult(f.b._buildResult()).perPlayer.p1.layerGains.sargonShip, -45);
    assert.deepEqual(f.b.errors, []);
  }
});

test('little grinder: one random active bond per second, concurrent gains use the live reduced count and no active bond is a no-op', () => {
  const run = () => {
    const f = makeBattle({ autoFinish: false, seed: 728, players: [{ playerId: 'p1', units: [], relics: ['relic_220'],
      bonds: { sargonShip: { active: true, layers: 100 }, kjeragShip: { active: true, layers: 100 } } }] });
    f.run(1.1);
    const ps = f.b.getPlayer('p1');
    assert.equal(ps.bonds.sargonShip.layers + ps.bonds.kjeragShip.layers, 180);
    const selected = Object.keys(ps.bonds).find((id) => ps.bonds[id].layers === 80);
    f.b.addLayers('p1', selected, 10);
    assert.equal(ps.bonds[selected].layers, 90);
    assert.equal(f.b._pp('p1').layerGains[selected], -10);
    ps.bonds.sargonShip.active = false; ps.bonds.kjeragShip.active = false;
    f.run(2);
    assert.equal(ps.bonds.sargonShip.layers + ps.bonds.kjeragShip.layers, 190);
    return { layers: ps.bonds, result: compactResult(f.b._buildResult()).perPlayer.p1.layerGains };
  };
  assert.deepEqual(run(), run());
});

test('recollection instrument: fewer than seven collectibles, pending time machine and consumed ticket records are cleaned, one-time healing is retained', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0');
    grantRelic(ps, 'relic_014'); grantRelic(ps, 'relic_158');
    grantRelic(ps, 'relic_234'); grantRelic(ps, 'relic_235');
    const lp = ps.lp;
    assert.ok(ps.relicReverseLpRound > 0); assert.ok(ps.scratchTickets.length);
    grantRelic(ps, 'relic_219');
    assert.deepEqual(ps.relics.map((r) => r.id), ['relic_219']);
    assert.equal(ps.relicReverseLpRound, 0); assert.deepEqual(ps.scratchTickets, []);
    assert.equal(ps.lp, lp, 'already settled healing is not undone');
  } finally { h.m.dispose(); }
});

test('little grinder: signed results persist through normal/unite and next battle, synthetic results ignored; server authority required', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'), m = h.m;
    grantRelic(ps, 'relic_220');
    ps.layers.sargonShip = 45; ps.recompute();
    const result = { leaked: [], perfect: true, coins: 0, layerGains: { sargonShip: -20 } };
    m.lastResults = new Map([[ps.playerId, result]]);
    m.phase = PHASE.COMBAT; m.settle(null, null);
    assert.equal(ps.layers.sargonShip, 25);
    assert.equal(ps.battleInput().bonds.sargonShip.layers, 25);
    settleRelicLayerLosses(ps, { ...result, synthetic: true }); assert.equal(ps.layers.sargonShip, 25);
    settleRelicLayerLosses(ps, result); assert.equal(ps.layers.sargonShip, 5);
    assert.equal(bondsWithGains({ sargonShip: { layers: 5 } }, { sargonShip: -20 }).sargonShip.layers, 0);
    for (const flag of [true, false]) {
      const spec = { players: [ps.battleInput()], flags: { layerGainsEnabled: flag } };
      assert.equal(requiresTraitLayerAuthority(spec, m.gd), true);
      assert.equal(m._authorityFor({ spec, players: [ps.playerId] }), null);
    }
    const spec = buildBattleSpec({ ...m._normalOpts(ps), timeLimit: 3,
      players: [{ ...ps.battleInput(), units: [], bonds: { sargonShip: { active: true, layers: 45 } } }] });
    const a = createBattleFromSpec(spec, m.ds), b = createBattleFromSpec(JSON.parse(JSON.stringify(spec)), m.ds);
    a.runToEnd(4); b.runToEnd(4);
    assert.equal(resultDigest(a.result()).hash, resultDigest(b.result()).hash);
    assert.ok(a.result().perPlayer[ps.playerId].layerGains.sargonShip < 0);
  } finally { h.m.dispose(); }
});
