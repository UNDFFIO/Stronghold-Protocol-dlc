import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { getRelic, pickRelicChoices } from '../../shared/relics.js';
import { LIONHEART_ID } from '../../shared/specialOperators.js';
import { createRng } from '../../server/sim/rng.js';
import { grantRelic, selectRelic } from '../../server/match/relics.js';
import { previewPlayer } from '../../server/match/preview.js';
import { makeMatch } from './harness.js';
import { FakeBattle } from './fakeBattle.js';

const ID = 'relic_247';
const kings = (ps) => ps.allChess().filter((p) => p.id === LIONHEART_ID);
const activate = (ps) => { ps.bondCountBonus.victoriaShip = 6; ps.recompute(); };

test('王权：激活维多利亚从29升到30立即赠送本人狮心王，重复和移除不再发放，新局重置', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'), other = h.ps('p_1');
    activate(ps); ps.addLayers('victoriaShip', 29);
    assert.equal(kings(ps).length, 0);
    assert.ok(!ps.relics.some((r) => r.id === ID));
    ps.addLayers('victoriaShip', 1);
    assert.deepEqual(ps.relics.filter((r) => r.id === ID), [{ id: ID, round: 1 }]);
    assert.equal(kings(ps).length, 1);
    assert.equal(kings(ps)[0].poolCopies, 0);
    assert.ok(ps.hand.includes(kings(ps)[0]));
    assert.equal(kings(other).length, 0);
    assert.ok(!other.relics.some((r) => r.id === ID));
    assert.equal(ps.privateView().relicReward.id, ID);
    for (let i = 0; i < 3; i++) ps.recompute();
    ps.relics = []; ps.recompute();
    ps.bondCountBonus.victoriaShip = 0; ps.recompute(); activate(ps);
    ps.addLayers('victoriaShip', 50);
    assert.equal(kings(ps).length, 1);
    assert.equal(ps.relics.length, 0);
  } finally { h.m.dispose(); }
  const fresh = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    fresh.toPrep(1); const ps = fresh.ps('p_0');
    assert.equal(ps.royalPowerGranted, false);
    assert.equal(kings(ps).length, 0);
    activate(ps); ps.addLayers('victoriaShip', 30);
    assert.equal(kings(ps).length, 1);
  } finally { fresh.m.dispose(); }
});

test('王权：30层后激活才获得，满整备区保留赠送，额外回合仍可触发', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0');
    ps.layers.victoriaShip = 30; ps.recompute();
    assert.equal(kings(ps).length, 0);
    assert.equal(grantRelic(ps, ID), null);
    assert.equal(grantRelic(ps, ID, { victoriaMilestone: true }), null);
    ps.hand = ps.hand.map(() => ps.newPiece('chess', 'chess_char_1_02_a'));
    ps.temp = ps.temp.map(() => ps.newPiece('chess', 'chess_char_1_02_a'));
    h.m.gd.endlessStartRound = h.m.gd.hiddenRound + 1; h.m.round = h.m.gd.endlessStartRound;
    activate(ps);
    assert.equal(kings(ps).length, 1);
    assert.ok(ps.temp.includes(kings(ps)[0]));
    assert.ok(ps.relics.some((r) => r.id === ID));
  } finally { h.m.dispose(); }
});

test('王权：常规抽取和直接发放隔离，未激活、淘汰、离场与预览不触发', () => {
  assert.equal(getRelic(ID).tier, 4);
  assert.equal(getRelic(ID).normalDrop, false);
  for (let seed = 0; seed < 200; seed++) assert.ok(!pickRelicChoices(20, [], createRng(seed)).includes(ID));
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0');
    ps.layers.victoriaShip = 40;
    const preview = previewPlayer(ps); preview.bondCountBonus = { victoriaShip: 6 }; preview.recompute();
    assert.equal(kings(ps).length, 0); assert.equal(ps.royalPowerGranted, false);
    ps.relicOffer = { id: 'forged', round: 1, options: [ID] };
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(grantRelic(ps, ID), null);
    ps.bondCountBonus.victoriaShip = 6;
    ps.left = true; ps.recompute(); assert.equal(kings(ps).length, 0);
    ps.left = false; ps.alive = false; ps.recompute(); assert.equal(kings(ps).length, 0);
    ps.alive = true; ps.lp = 0; ps.recompute(); assert.equal(kings(ps).length, 0);
  } finally { h.m.dispose(); }
});

test('王权：服务端和客户端战斗增层结算后赠送，下一场可部署独立干员', () => {
  for (const clientCombat of [false, true]) {
    const h = makeMatch({ mode: 'solo', fake: true, clientCombat,
      script: () => ({ layerGains: { p_0: { victoriaShip: 1 } } }) }).start();
    try {
      h.toPrep(1); const ps = h.ps('p_0');
      activate(ps); ps.addLayers('victoriaShip', 29);
      assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE && h.m.round === 1));
      assert.equal(ps.layers.victoriaShip, 30);
      assert.equal(kings(ps).length, 1);
      const first = FakeBattle.instances.find((b) => b.kind === 'normal' && b.round === 1);
      assert.ok(!first.opts.players[0].relics.includes(ID));
      h.toPrep(2);
      assert.equal(ps.move(kings(ps)[0].uid, { area: 'board', row: 9, col: 4 }).ok, true);
      assert.ok(ps.battleInput().units.some((u) => u.chessId === LIONHEART_ID));
      assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE && h.m.round === 2));
      const next = FakeBattle.instances.find((b) => b.kind === 'normal' && b.round === 2);
      assert.ok(next.opts.players[0].units.some((u) => u.chessId === LIONHEART_ID));
      assert.equal(kings(ps).length, 1);
    } finally { h.m.dispose(); }
  }
});
