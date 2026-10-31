import { ERR } from '../../shared/constants.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { grantRelic } from '../../server/match/relics.js';
import { prepareCollapseTiles, activeCollapseTiles } from '../../server/match/relicCollapse.js';
import { buildDeployMap } from '../../server/match/board.js';
import { stageOverrides, deployMap } from '../../public/js/ui/gameLogic/placement.js';
import { migrateJournal } from '../../public/js/ui/relicJournal.js';
import { getRelic } from '../../shared/relics.js';
import { scratchTier } from '../../shared/scratchTickets.js';

for (const [stage, count] of [['act1autochess_m04', 3], ['act2autochess_m01', 3], ['act2autochess_m04', 5], ['act1autochess_m01', 4]]) {
  test(`collapse ${stage}: count, round transition, eviction, client/server legality and owner isolation`, () => {
    const h = makeMatch({ humans: 2, fake: true }).start();
    try {
      h.toPrep(1); h.setStage(stage);
      const ps = h.ps('p_0'), mate = h.ps('p_1');
      assert.equal(grantRelic(ps, 'relic_239')?.id, 'relic_239');
      assert.equal(grantRelic(ps, 'relic_239'), null);
      assert.deepEqual(activeCollapseTiles(ps), [], 'grant during prep waits for next round');
      h.toPrep(2);
      const keys = activeCollapseTiles(ps).slice();
      assert.equal(keys.length, count);
      assert.equal(new Set(keys).size, count);
      const base = buildDeployMap(h.m.stage, { deviceOverrides: ps.deviceOverrides, tileOverrides: ps.tileOverrides });
      const client = deployMap(h.m.stage, stageOverrides(ps.privateView()));
      for (const key of keys) {
        assert.ok(base.has(key)); assert.ok(!ps.deployMap().has(key)); assert.ok(!client.has(key));
        assert.ok(mate.deployMap().has(key));
      }
      assert.deepEqual(activeCollapseTiles(mate), []);
      prepareCollapseTiles(ps);
      assert.deepEqual(activeCollapseTiles(ps), keys, 'no reroll on repeated preparation');
      // Fill every eligible tile to ensure the next draw hits deployed operators, with both reserve rows full.
      ps.board.clear();
      for (const key of base.keys()) ps.board.set(key, ps.newPiece('chess', 'chess_char_1_01_a'));
      ps.hand = ps.hand.map(() => ps.newPiece('item', 'test'));
      ps.temp = Array.from({ length: 5 }, () => ps.newPiece('item', 'test'));
      const before = new Map(ps.board);
      h.m.round = 3;
      h.m.enterPrep();
      const next = activeCollapseTiles(ps);
      assert.equal(next.length, count); assert.notDeepEqual(next, keys);
      for (const key of next) {
        const unit = before.get(key);
        assert.ok(!ps.board.has(key));
        assert.ok([...ps.hand, ...ps.temp].some((p) => p?.uid === unit.uid), 'eviction preserves unit even with full reserves');
        assert.equal(ps.move(unit.uid, { area: 'board', row: +key.split(',')[0], col: +key.split(',')[1] }).error, ERR.BAD_TILE);
      }
      ps.relics = [];
      ps.recompute();
      assert.deepEqual(activeCollapseTiles(ps), []);
      for (const key of next) assert.ok(ps.deployMap().has(key), 'removal restores tile');
    } finally { h.m.dispose(); }
  });
}

test('collapse is reproducible, ignores boss rounds, preserves terrain overrides and handles too few tiles', () => {
  const run = () => {
    const h = makeMatch({ mode: 'solo', fake: true, seed: 17 }).start();
    try {
      h.toPrep(1); const ps = h.ps('p_0');
      grantRelic(ps, 'relic_239');
      h.toPrep(2); const tiles = [...activeCollapseTiles(ps)];
      h.m.round = h.m.gd.bossRound;
      assert.deepEqual(activeCollapseTiles(ps), []);
      prepareCollapseTiles(ps); assert.deepEqual(ps.collapseTiles, []);
      h.m.round = 3;
      const all = [...buildDeployMap(h.m.stage).keys()];
      ps.tileOverrides = Object.fromEntries(all.slice(1).map((k) => [k, 'none']));
      const overrides = { ...ps.tileOverrides };
      prepareCollapseTiles(ps);
      assert.equal(ps.collapseTiles.length, 1);
      assert.deepEqual(ps.tileOverrides, overrides);
      return tiles;
    } finally { h.m.dispose(); }
  };
  assert.deepEqual(run(), run());
});

test('official 239 and scratch 243 stay distinct; only v1 journals migrate', () => {
  assert.equal(getRelic('relic_239').tier, 6);
  assert.equal(scratchTier(5).relicId, 'relic_243');
  assert.equal(getRelic('relic_243').scratchTicket, true);
  assert.deepEqual(migrateJournal({ v: 1, ids: ['relic_239'] }), ['relic_243']);
  assert.deepEqual(migrateJournal({ v: 2, ids: ['relic_239'] }), ['relic_239']);
  assert.deepEqual(migrateJournal({ ids: {} }), []);
});
