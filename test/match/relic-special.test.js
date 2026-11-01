import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { RELICS, relicIncome } from '../../shared/relics.js';
import { settleRelics, selectRelic, previewRelicLpLoss, grantRelic } from '../../server/match/relics.js';
import { attachAudit } from '../../server/match/audit.js';

function claim(h, ps, id) {
  ps.relics = RELICS.filter((r) => r.id !== id).map((r) => ({ id: r.id, round: h.m.round }));
  grantRelic(ps, 'relic_235');
  const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
  assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014', 'relic_014']);
  assert.equal(selectRelic(ps, offer.id, 0).id, id);
  assert.equal(selectRelic(ps, offer.id, 0), null);
  ps.relics = ps.relics.filter((r) => r.id === id);
  ps.scratchTickets = [];
}
test('时间机器：领取后每场战斗生效，真实漏怪仍扣血且旧存档不再反转', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'); claim(h, ps, 'relic_158');
    for (const round of [2, 3]) {
      h.toPrep(round);
      ps.relicReverseLpRound = round; // Legacy saved state must not restore the obsolete effect.
      ps.relicShieldRound = round; ps.relicShield = 2;
      assert.equal(previewRelicLpLoss(ps, 3), 1);
      const audit = attachAudit(h.m, { strict: true });
      const spec = { players: [ps.battleInput()], enemies: [{ key: 'r_leak', count: 3, time: 0 }],
        defs: { enemies: { r_leak: enemyRec({ key: 'r_leak', speed: 100 }) } }, seed: 123 };
      const battle = makeBattle(spec); battle.runToEnd();
      const replay = makeBattle(JSON.parse(JSON.stringify(spec))); replay.runToEnd();
      assert.deepEqual(replay.result(), battle.result());
      assert.equal(battle.eventsOf('fx').filter(e => e[4]?.kind === 'timeMachine').length, 3);
      const result = battle.result().perPlayer[ps.playerId];
      assert.equal(result.leaked.length, 3);
      const lp = ps.lp;
      h.m.lastResults.set(ps.playerId, result); h.m.settle();
      assert.equal(ps.lp, lp - 1);
      assert.equal(audit.violations.length, 0);
    }
  } finally { h.m.dispose(); }
});

test('时间机器：首领阵地与全队超时扣血不再反转', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const a = h.ps('p_0'), b = h.ps('p_1'); claim(h, a, 'relic_158'); h.toPrep(2);
    h.m.teamLp = 20; a.lpAtFinal = 10; b.lpAtFinal = 10;
    h.m._teamLpLoss(2, [a.playerId]); assert.equal(h.m.teamLp, 18);
    h.m._teamLpLoss(2, [b.playerId]); assert.equal(h.m.teamLp, 16);
    h.m._teamLpLoss(2); assert.equal(h.m.teamLp, 14);
  } finally { h.m.dispose(); }
});

for (const kind of ['normal', 'unite', 'boss', 'hidden']) test(`时间机器：${kind} 同帧传送原实体、前三名各一次、保留状态与计数`, () => {
  const h = makeBattle({ kind, players: [{ playerId: 'p1', relics: [{ id: 'relic_158' }], units: [] }],
    defs: { enemies: { test_return: enemyRec({ key: 'test_return' }) } } });
  const enemies = Array.from({ length: 4 }, () => h.spawn('test_return', { inTotal: true }));
  const gate = h.b.grid.specialTiles('end')[0];
  for (const [i, e] of enemies.entries()) {
    e.hp -= 10;
    h.b.addBuff(e, { key: 'return-test', duration: 20, mods: { atkMul: 1.5 } });
    const hp = e.hp, atk = e.s.atk, id = e.id, seq = e.spawnSeq;
    e.x = gate[1]; e.y = gate[0];
    const time = h.b.time;
    h.b.leak(e);
    assert.equal(h.b.time, time);
    assert.equal(e.alive, i < 3);
    if (i < 3) {
      assert.equal(e.id, id); assert.equal(e.spawnSeq, seq);
      assert.equal(e.hp, hp); assert.equal(e.s.atk, atk); assert.ok(!e.hidden && !e.removed);
      assert.ok(['start', 'telout'].includes(h.b.grid.tile(e.y, e.x).special));
      assert.equal(h.b.leakedInTotal, 0);
    }
  }
  assert.equal(h.eventsOf('spawn').length, 4);
  assert.equal(h.eventsOf('fx').filter(e => ['appear', 'disappear'].includes(e[1])).length, 0);
  assert.equal(h.eventsOf('leak').length, 1);
  enemies[0].x = gate[1]; enemies[0].y = gate[0]; h.b.leak(enemies[0]);
  assert.equal(enemies[0].alive, false);
  assert.equal(h.b.total, 4); assert.equal(h.b.leakedInTotal, 2);
});

test('木棍：真实候选领取，下回合资金+2，重复不叠加，队友和新局不受影响及收入审计', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const a = h.ps('p_0'), b = h.ps('p_1'); claim(h, a, 'relic_159');
    const audit = attachAudit(h.m, { strict: true });
    a.endPrep(); b.endPrep();
    const before = a.funds; a.startRound(2);
    assert.equal(a.funds - before, h.m.gd.income(2) + 2);
    assert.equal(relicIncome(['relic_159', 'relic_159', 'relic_025']), 3);
    const bIncome = relicIncome(b.relics); const bBefore = b.funds; b.startRound(2);
    assert.equal(b.funds - bBefore, h.m.gd.income(2) + bIncome);
    assert.equal(audit.violations.length, 0);
    assert.ok(a.privateView().relics.some((r) => r.id === 'relic_159'));
  } finally { h.m.dispose(); }
  const fresh = makeMatch({ mode: 'solo', fake: true }).start();
  try { assert.equal(relicIncome(fresh.ps('p_0').relics), 0); } finally { fresh.m.dispose(); }
});


test('时间机器：队友蓝门不受影响，超时不传送，同一敌人不占用后续名额', () => {
  const make = () => makeBattle({ kind: 'boss', players: [
    { playerId: 'p1', colOffset: 0, relics: ['relic_158', 'relic_158'], units: [] },
    { playerId: 'p2', colOffset: 8, relics: [], units: [] },
  ], defs: { enemies: { test_return: enemyRec({ key: 'test_return' }) } } });
  const h = make();
  const enter = (e, c = 2) => { e.x = c; e.y = 2; h.b.leak(e); };
  const mate = h.spawn('test_return'); enter(mate, 18); assert.equal(mate.alive, false);
  const first = h.spawn('test_return'); enter(first); assert.equal(first.alive, true);
  enter(first); assert.equal(first.alive, false);
  for (let i = 0; i < 3; i++) {
    const e = h.spawn('test_return'); enter(e); assert.equal(e.alive, i < 2);
  }
  assert.equal(h.eventsOf('fx').filter(e => e[4]?.kind === 'timeMachine').length, 3);
  const timeout = make();
  timeout.spawn('test_return'); timeout.b.forceEnd('timeout');
  assert.equal(timeout.eventsOf('fx').filter(e => e[4]?.kind === 'timeMachine').length, 0);
  assert.equal(timeout.result().perPlayer.p1.leaked.length, 1);
});


test('时间机器：首领传送门追加路线不污染重走路线，回门后仍可正常漏怪', () => {
  const h = makeBattle({ kind: 'boss', players: [{ playerId: 'p1', relics: ['relic_158'], units: [] }],
    routes: [{ motion: 'WALK', start: [2, 10], end: [1, 3], checkpoints: [] }],
    enemies: [{ key: 'test_return', count: 1 }],
    defs: { enemies: { test_return: enemyRec({ key: 'test_return', speed: 3 }) } } });
  let returnCount = 0;
  const fx = h.b.fx.bind(h.b);
  h.b.fx = (kind, args) => {
    if (args?.kind === 'timeMachine') {
      returnCount++;
      const e = h.b.enemies.find(e => e.id === args.id);
      assert.ok(e.alive && !e.hidden);
      assert.deepEqual([e.y, e.x], [2, 10]);
      assert.equal(e.route.legs.filter(leg => leg.t === 'disappear').length, 0);
    }
    return fx(kind, args);
  };
  h.runToEnd();
  assert.equal(returnCount, 1);
  assert.equal(h.result().perPlayer.p1.leaked.length, 1);
  assert.equal(h.eventsOf('spawn').length, 1);
});
