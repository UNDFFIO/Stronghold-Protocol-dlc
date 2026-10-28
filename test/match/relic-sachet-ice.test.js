import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RELICS, getRelic, pickRelicChoices } from '../../shared/relics.js';
import { createRng } from '../../server/sim/rng.js';
import { settleRelics, selectRelic, grantRelic } from '../../server/match/relics.js';
import { drawAscensionLottery } from '../../server/match/ascensionLottery.js';
import { makeMatch, give, legalTileFor } from './harness.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';

function exhaust(ps, id) {
  ps.relics = RELICS.filter((r) => r.id !== id).map((r) => ({ id: r.id, round: 1 }));
  grantRelic(ps, 'relic_235');
}

test('天师锦囊：未激活或仅累计炎层数不能获取，激活后普通R1可选，领取时重新校验', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    exhaust(ps, 'relic_132');
    const opts = { hasScratchTicket: true, bonds: ps.bonds };
    ps.layers.yanShip = 100;
    assert.deepEqual(pickRelicChoices(1, ps.relics, createRng(1), opts), ['relic_014', 'relic_014', 'relic_014']);
    assert.equal(grantRelic(ps, 'relic_132'), null);
    const yan = [...h.m.pool.entries.keys()].filter((id) => h.m.gd.chess(id).bonds.includes('yanShip')).slice(0, 3);
    assert.equal(yan.length, 3);
    for (const id of yan) give(h.m, ps, id, 'board', legalTileFor(h.m, ps, id));
    assert.equal(ps.bonds.yanShip.active, true, 'real lineup activates Yan');
    const summoned = () => {
      const input = ps.battleInput();
      const f = makeBattle({ players: [{ ...input, relics: input.relics.filter((id) => id === 'relic_132'),
        units: [{ uid: 1, kind: 'chess', chessId: 'guard', row: 10, col: 4 }] }],
      defs: { chess: { guard: chessRec({ id: 'guard', bonds: ['yanShip'], skill: null }) } }, autoFinish: false });
      f.step();
      assert.deepEqual(f.b.errors, []);
      return f.b.allyUnits.filter((u) => u.mem.relicYanyou).length;
    };
    assert.equal(getRelic('relic_132').tier, 1);
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, ['relic_132', 'relic_014', 'relic_014', 'relic_014']);
    assert.equal(summoned(), 0);
    ps.bonds.yanShip.active = false;
    assert.equal(selectRelic(ps, offer.id, 0), null);
    assert.ok(!ps.battleInput().relics.includes('relic_132'));
    ps.bonds.yanShip.active = true;
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(selectRelic(ps, offer.id, 0).id, 'relic_132');
    assert.ok(ps.battleInput().relics.includes('relic_132'));
    assert.equal(summoned(), 1);
    assert.equal(grantRelic(ps, 'relic_132'), null);
  } finally { h.m.dispose(); }
});

test('天师锦囊：超限补给使用相同盟约限制', () => {
  for (const active of [false, true]) {
    const h = makeMatch({ mode: 'solo', difficulty: 'ASCENSION', seed: 7, fake: true }).start();
    try {
      const ps = h.ps('p_0');
      h.toPrep(4);
      ps.ascensionLottery = null;
      exhaust(ps, 'relic_132');
      ps.bonds.yanShip = { active, count: active ? 3 : 0, tier: active ? 1 : 0, layers: 0 };
      const reward = drawAscensionLottery(ps);
      assert.equal(reward.kind, 'relics');
      assert.deepEqual(reward.ids, active ? ['relic_132', 'relic_014', 'relic_014'] : ['relic_014', 'relic_014', 'relic_014']);
    } finally { h.m.dispose(); }
  }
});

test('冰中火：普通R1合法领取，候选不生效，下一场从可信ID应用增伤', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    exhaust(ps, 'relic_133');
    const damage = () => {
      const input = ps.battleInput();
      const f = makeBattle({ players: [{ ...input, relics: input.relics.filter((id) => id === 'relic_133'), units: [] }],
        defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1000000, speed: 0 }) } }, autoFinish: false });
      f.step();
      const e = f.spawn('dummy');
      const hp = e.hp;
      f.b.dealDamage(null, e, { type: 'element', element: 'burn', amount: 1000 });
      assert.deepEqual(f.b.errors, []);
      return hp - e.hp;
    };
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, ['relic_133', 'relic_014', 'relic_014', 'relic_014']);
    assert.equal(damage(), 7000);
    assert.equal(selectRelic(ps, offer.id, 0).id, 'relic_133');
    assert.equal(damage(), 12250);
  } finally { h.m.dispose(); }
});
