import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { RELICS, RELIC_TIERS, getRelic, dropWeights, pickRelic, pickRelicChoices, relicModifiers, relicIncome } from '../../shared/relics.js';
import { createRng } from '../../server/sim/rng.js';
import { settleRelics, selectRelic, grantRelic, startRelicRound } from '../../server/match/relics.js';
import { makeMatch } from './harness.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { settleDeathNote, deathNoteKeys, resolveDeathNoteName } from '../../server/match/deathNote.js';
import { attachAudit } from '../../server/match/audit.js';

test('官方负面藏品：合法定向领取、排重、普通池隔离与下一场敌方强化', () => {
  for (const [id, mul] of [['relic_177', 1.4], ['relic_181', 1.3], ['relic_185', 1.25], ['relic_187', 1.3]]) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(1); const ps = h.ps('p_0');
      assert.equal(getRelic(id).tier, 6);
      assert.equal(grantRelic(ps, id).id, id);
      assert.equal(grantRelic(ps, id), null);
      assert.ok(ps.privateView().relics.some((r) => r.id === id));
      for (let round = 1; round <= 20; round++) assert.ok(!pickRelicChoices(round, [], createRng(round)).includes(id));
      const b = makeBattle({ autoFinish: false, players: [{ ...ps.battleInput(), units: [] }],
        defs: { enemies: { curse_enemy: enemyRec({ key: 'curse_enemy', hp: 1000, atk: 100, def: 80, speed: 0 }) } },
        enemies: [{ key: 'curse_enemy' }] });
      b.step();
      assert.equal(b.enemies()[0].s.maxHp, 1000 * mul);
      assert.deepEqual(b.b.errors, []);
    } finally { h.m.dispose(); }
  }
});

test('莱塔尼亚权杖：下回合起每回合扣一次、最低1，隔离队友及战斗损血', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'), mate = h.ps('p_1');
    ps.lp = 4; mate.lp = 10;
    grantRelic(ps, 'relic_181');
    ps.relics.push({ id: 'relic_181', round: 1 });
    startRelicRound(ps, 1); assert.equal(ps.lp, 4);
    const lost = ps.stats.lpLost;
    ps.relicReverseLpRound = 2;
    startRelicRound(ps, 2); assert.equal(ps.lp, 3);
    startRelicRound(ps, 2); assert.equal(ps.lp, 3);
    assert.equal(ps.stats.lpLost, lost);
    h.m._openTeamLp();
    startRelicRound(ps, 3);
    assert.equal(h.m.teamLp, 12); assert.equal(ps.lp, 2); assert.equal(mate.lp, 10);
    h.m._syncTeamLp(); assert.equal(ps.lp, 2); assert.equal(mate.lp, 10);
    startRelicRound(ps, 4); startRelicRound(ps, 5);
    assert.equal(ps.lp, 1); assert.equal(ps.alive, true);
    assert.equal(mate.lp, 10);
  } finally { h.m.dispose(); }
});

test('半洗孤钻：回合收入连同延期资金及收藏品收入减半取整，审计一致', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'), mate = h.ps('p_1');
    const audit = attachAudit(h.m, { invariants: false });
    grantRelic(ps, 'relic_185'); grantRelic(ps, 'relic_025');
    ps.relics.push({ id: 'relic_185', round: 1 });
    ps.funds = 9; ps.pendingFunds = 3;
    ps.clearUnfrozenShop();
    ps.startRound(3);
    assert.equal(ps.funds, 9 + Math.floor((h.m.gd.income(3) + 3 + 1) / 2));
    assert.equal(ps.pendingFunds, 0);
    assert.deepEqual(audit.violations, []);
    const f = ps.funds; ps.addFunds(7, { reason: 'reward' }); assert.equal(ps.funds, f + 7);
    mate.funds = 0; mate.startRound(3); assert.equal(mate.funds, h.m.gd.income(3));
  } finally { h.m.dispose(); }
});

test('酒神的印记：实际部署上限减少，超额干员退回、移除恢复，队友独立', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1); const ps = h.ps('p_0'), mate = h.ps('p_1');
    const cap = ps.deployCap, mateCap = mate.deployCap;
    const id = [...h.m.pool.entries.keys()][0];
    for (let i = 0; i < cap; i++) ps.board.set(`10,${i + 2}`, { uid: 1000 + i, kind: 'chess', id, items: [] });
    const total = ps.allChess().length;
    grantRelic(ps, 'relic_187');
    assert.equal(ps.deployCap, cap - 1); assert.ok(ps.deployCount <= ps.deployCap);
    assert.equal(ps.allChess().length, total);
    assert.equal(mate.deployCap, mateCap);
    ps.deployCapMin = cap + 3; assert.equal(ps.deployCap, cap + 2);
    ps.relics = []; ps.recompute(); assert.equal(ps.deployCap, cap + 3);
  } finally { h.m.dispose(); }
});

test('负面死亡笔记：与传说版并存，可定向授予但不进入普通候选池', () => {
  assert.equal(getRelic('relic_242').tier, 6);
  assert.equal(getRelic('relic_241').tier, 5);
  for (let round = 1; round <= 20; round++) {
    assert.ok(!pickRelicChoices(round, [], createRng(round)).includes('relic_242'));
  }
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    assert.equal(grantRelic(ps, 'relic_241').id, 'relic_241');
    assert.equal(grantRelic(ps, 'relic_242').id, 'relic_242');
    assert.equal(grantRelic(ps, 'relic_242'), null);
    assert.ok(ps.battleInput().relics.includes('relic_242'));
    const battle = makeBattle({ autoFinish: false,
      players: [{ ...ps.battleInput(), units: [{ uid: 1, kind: 'chess', chessId: 'note_op', row: 10, col: 4 }] }],
      defs: { chess: { note_op: chessRec({ id: 'note_op', skill: null }) } } });
    battle.step();
    assert.equal(battle.unit(1).removed, true, 'a real grant reaches the next battle and triggers its effect');
    assert.equal(battle.b.redeploy(battle.unit(1)), false);
    assert.deepEqual(battle.b.errors, []);
  } finally { h.m.dispose(); }
});

test('热水壶：仅补足合格候选缺位，数量、回合和模式条件不变', () => {
  const owned = RELICS.filter((r) => !['relic_003', 'relic_004'].includes(r.id));
  const opts = { hasScratchTicket: true };
  const choices = pickRelicChoices(1, owned, createRng(3), opts);
  assert.deepEqual([...choices].sort(), ['relic_003', 'relic_004', 'relic_014']);
  assert.deepEqual(pickRelicChoices(1, RELICS, createRng(3), { ...opts, count: 4 }), Array(4).fill('relic_014'));
  assert.deepEqual(pickRelicChoices(0, RELICS, createRng(3)), []);
  for (let seed = 0; seed < 100; seed++) assert.ok(!pickRelicChoices(1, [], createRng(seed)).includes('relic_014'));
  assert.deepEqual(relicModifiers(['relic_014', 'relic_014']), {});
});

test('热水壶：领取立即回复本人2点，反复领取生效，伪造及重复请求不回血', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    const ps = h.ps('p_0'), mate = h.ps('p_1');
    h.toPrep(1);
    ps.relics = RELICS.map((r) => ({ id: r.id, round: 1 }));
    grantRelic(ps, 'relic_235');
    ps.lp = 11; mate.lp = 9;
    const loss = ps.stats.lpLost;
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, Array(4).fill('relic_014'));
    assert.equal(ps.lp, 11);
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(selectRelic(ps, offer.id, 4), null);
    assert.equal(selectRelic(ps, offer.id, 2).id, 'relic_014');
    assert.equal(ps.lp, 13);
    assert.equal(selectRelic(ps, offer.id, 1), null);
    assert.equal(ps.lp, 13);
    h.m._openTeamLp();
    grantRelic(ps, 'relic_014');
    h.m._syncTeamLp(); h.m._syncTeamLp();
    assert.equal(ps.lp, 15); assert.equal(mate.lp, 9); assert.equal(h.m.teamLp, 24);
    assert.equal(ps.stats.lpLost, loss);
    assert.equal(ps.relics.filter((r) => r.id === 'relic_014').length, 1);
    ps.alive = false;
    assert.equal(grantRelic(ps, 'relic_014'), null);
    assert.equal(ps.lp, 15);
  } finally { h.m.dispose(); }
});

test('死神之眼：准备阶段一次交易，扣本人当前一半生命，持久降价且不重置本回合书写次数', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(3);
    const ps = h.ps('p_0'), mate = h.ps('p_1');
    ps.lp = 25; ps.funds = 16;
    assert.ok(ps.tradeShinigamiEyes(3).error);
    grantRelic(ps, 'relic_241');
    assert.equal(ps.privateView().deathNote.cost, 8);
    assert.ok(ps.tradeShinigamiEyes(2).error);
    ps.ready = true; assert.ok(ps.tradeShinigamiEyes(3).error); ps.ready = false;
    h.m.phase = PHASE.COMBAT; assert.ok(ps.tradeShinigamiEyes(3).error); h.m.phase = PHASE.PREP;
    ps.left = true; assert.ok(ps.tradeShinigamiEyes(3).error); ps.left = false;
    ps.alive = false; assert.ok(ps.tradeShinigamiEyes(3).error); ps.alive = true;
    assert.equal(ps.lp, 25); assert.equal(ps.shinigamiEyes, false);
    assert.deepEqual(ps.writeDeathNote('incorrect', 3), { ok: true });
    const mateLp = mate.lp;
    assert.deepEqual(h.m.handle(ps.playerId, { t: 'g.shinigamiEyes', round: 3 }), { ok: true });
    assert.equal(ps.lp, 13); assert.equal(mate.lp, mateLp); assert.equal(mate.shinigamiEyes, false);
    assert.equal(ps.privateView().shinigamiEyes, true);
    assert.deepEqual(ps.privateView().deathNote, { used: true, cost: 4 });
    assert.ok(ps.effectsView().some((e) => e.id === 'shinigami-eyes'));
    assert.ok(ps.tradeShinigamiEyes(3).error); assert.equal(ps.lp, 13);
    assert.ok(ps.writeDeathNote('incorrect', 3).error); assert.equal(ps.funds, 8);
    h.toPrep(4); ps.funds = 3;
    assert.ok(ps.writeDeathNote('incorrect', 4).error); assert.equal(ps.funds, 3);
    ps.funds = 4;
    const [key, enemy] = Object.entries(h.m.gd.raw.enemies).find(([, e]) => e.name);
    assert.deepEqual(ps.writeDeathNote(enemy.name, 4), { ok: true });
    assert.equal(ps.funds, 0); assert.equal(ps.round.spent, 4);
    assert.ok(deathNoteKeys(h.m).includes(key));
    assert.equal(validateC2S({ t: 'g.shinigamiEyes', round: 4 }), null);
    assert.ok(validateC2S({ t: 'g.shinigamiEyes', round: 0 }));
    assert.ok(validateC2S({ t: 'g.shinigamiEyes' }));
    h.m.finish({ victory: false, reason: 'abandoned' });
    assert.equal(h.ended.players.find((p) => p.playerId === ps.playerId).shinigamiEyes, true);
    assert.equal(h.ended.players.find((p) => p.playerId === mate.playerId).shinigamiEyes, undefined);
  } finally { h.m.dispose(); }
  const fresh = makeMatch({ mode: 'solo', fake: true }).start();
  try { assert.equal(fresh.ps('p_0').shinigamiEyes, false); } finally { fresh.m.dispose(); }
});

test('死神之眼：共享生命已合并时仅扣本人份额，后续同步不会回滚交易或扣队友生命', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(3);
    const ps = h.ps('p_0'), mate = h.ps('p_1');
    ps.lp = 25; mate.lp = 11;
    h.m._openTeamLp();
    grantRelic(ps, 'relic_241');
    assert.deepEqual(ps.tradeShinigamiEyes(3), { ok: true });
    assert.equal(h.m.teamLp, 24);
    h.m._syncTeamLp(); h.m._syncTeamLp();
    assert.equal(ps.lp, 13); assert.equal(mate.lp, 11);
    assert.equal(ps.lpAtFinal + mate.lpAtFinal, 24);
    assert.ok(ps.tradeShinigamiEyes(3).error);
    assert.equal(h.m.teamLp, 24);
  } finally { h.m.dispose(); }
});

test('死神之眼：当前生命的一半向上保留，生命代价不触发护盾和战斗损血统计', () => {
  for (const lp of [1, 2, 3, 24, 25]) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(1);
      const ps = h.ps('p_0');
      grantRelic(ps, 'relic_241'); ps.lp = lp;
      ps.relicShield = 2; ps.relicShieldRound = 1;
      const lost = ps.stats.lpLost;
      assert.deepEqual(ps.tradeShinigamiEyes(1), { ok: true });
      assert.equal(ps.lp, Math.ceil(lp / 2)); assert.equal(ps.alive, true);
      assert.equal(ps.relicShield, 2);
      assert.equal(ps.stats.lpLost, lost);
    } finally { h.m.dispose(); }
  }
});

test('死亡笔记：不进入任何随机奖池；本人30次死亡且累计损血10点解锁，同局唯一且结算不重复累计', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    const a = h.ps('p_0'), b = h.ps('p_1');
    assert.equal(getRelic('relic_241').tier, 5);
    const others = RELICS.filter((r) => r.id !== 'relic_241').map((r) => r.id);
    assert.equal(pickRelic(15, others, createRng(1), { tierWeights: [0, 0, 0, 0, 1], hasScratchTicket: true }), null);
    h.toPrep(1);
    settleDeathNote(a, { deaths: 29 }, 'normal', 9);
    settleDeathNote(a, { deaths: 29 }, 'normal', 9);
    settleDeathNote(a, { deaths: 100, synthetic: true }, 'unite', 100);
    assert.equal(a.deathNoteDeaths, 29);
    assert.equal(a.deathNoteLpLost, 9);
    assert.equal(a.relics.length, 0);
    h.toPrep(2);
    settleDeathNote(a, { deaths: 1 }, 'normal', 1);
    assert.equal(a.relics.filter((r) => r.id === 'relic_241').length, 1);
    assert.equal(a.deathNoteAwarded, true);
    assert.equal(b.deathNoteDeaths, 0);
    settleDeathNote(b, { deaths: 30 }, 'normal', 10);
    assert.equal(b.relics.some((r) => r.id === 'relic_241'), false);
    assert.equal(grantRelic(b, 'relic_241'), null);
    a.alive = false; a.left = true;
    assert.equal(grantRelic(b, 'relic_241'), null, 'an eliminated/departed owner still holds the unique item');
    assert.equal(validateC2S({ t: 'g.deathNote', name: 'enemy', round: 2 }), null);
    assert.ok(validateC2S({ t: 'g.deathNote', name: '', round: 2 }));
  } finally { h.m.dispose(); }
  const fresh = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    assert.equal(fresh.ps('p_0').deathNoteDeaths, 0);
    assert.equal(fresh.ps('p_0').deathNoteLpLost, 0);
  } finally { fresh.m.dispose(); }
});

for (const deathsFirst of [true, false]) test(`死亡笔记：两项门槛均需达到，先达成${deathsFirst ? '死亡' : '损血'}也能在后续零死亡结算解锁`, () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    settleDeathNote(ps, { deaths: deathsFirst ? 30 : 29 }, 'normal', deathsFirst ? 9 : 10);
    assert.equal(ps.relics.length, 0);
    h.toPrep(2);
    settleDeathNote(ps, { deaths: deathsFirst ? 0 : 1 }, 'normal', deathsFirst ? 1 : 0);
    assert.equal(ps.deathNoteDeaths, 30);
    assert.equal(ps.deathNoteLpLost, 10);
    assert.equal(ps.relics.filter((r) => r.id === 'relic_241').length, 1);
  } finally { h.m.dispose(); }
});

test('死亡笔记：真实结算累计实际损血，护盾、回血与队友不贡献进度，联防不重复扣血', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0'), mate = h.ps('p_1');
    ps.deathNoteDeaths = 30;
    const report = (leaks) => ({ deaths: 0, leaked: Array.from({ length: leaks }, () => ({})), perfect: leaks === 0, coins: 0 });
    const settle = (round, ownLeaks, mateLeaks) => {
      h.toPrep(round);
      h.m.lastResults = new Map([[ps.playerId, report(ownLeaks)], [mate.playerId, report(mateLeaks)]]);
      h.m.settle();
    };
    ps.relicShield = 2; ps.relicShieldRound = 1;
    settle(1, 6, 6);
    assert.equal(ps.deathNoteLpLost, 4);
    assert.equal(mate.deathNoteLpLost, 6);
    ps.relicReverseLpRound = 2;
    settle(2, 6, 0);
    assert.equal(ps.deathNoteLpLost, 4, 'healing neither adds progress nor subtracts prior losses');
    assert.equal(ps.relics.length, 0);
    settle(3, 6, 0);
    assert.equal(ps.deathNoteLpLost, 10);
    assert.ok(ps.relics.some((r) => r.id === 'relic_241'));
  } finally { h.m.dispose(); }
});

test('死亡笔记：首领结算先同步共享血池，按本人分摊损血达成第二项条件', () => {
  const h = makeMatch({ humans: 2, fake: true });
  try {
    const { m } = h;
    const ps = h.ps('p_0'), mate = h.ps('p_1');
    m.round = m.gd.bossRound; m.phase = PHASE.FINAL_ASSAULT;
    m.hiddenBossId = null; m.bossPool = { hp: 0 };
    ps.lp = ps.lpAtFinal = 20; mate.lp = mate.lpAtFinal = 10;
    ps.deathNoteDeaths = 30; ps.deathNoteLpLost = 6;
    mate.deathNoteDeaths = 30; mate.deathNoteLpLost = 6;
    m.teamLp = 24;
    m.fields = [{ fieldId: 'b1', players: [ps.playerId, mate.playerId], live: true }];
    const report = { deaths: 0, perfect: true, leaked: [], killed: 0, damageDealt: 0 };
    m._finishFinal(false, () => ({ perPlayer: { [ps.playerId]: report, [mate.playerId]: report } }));
    assert.equal(ps.lp, 16); assert.equal(mate.lp, 8);
    assert.equal(ps.deathNoteLpLost, 10); assert.equal(mate.deathNoteLpLost, 8);
    assert.ok(ps.relics.some((r) => r.id === 'relic_241'));
    assert.equal(mate.relics.length, 0);
    settleDeathNote(ps, report, 'boss', 4);
    assert.equal(ps.deathNoteLpLost, 10);
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`死亡笔记：写中领袖直接完成多人共享目标（client=${clientCombat}）`, () => {
  const h = makeMatch({ humans: 3, clientCombat }).start();
  try {
    h.toPrep(1);
    const { m } = h;
    m.round = m.gd.bossRound;
    m.hiddenBossId = null;
    const ps = h.ps('p_0');
    const boss = m.gd.raw.bosses[m.bossId];
    grantRelic(ps, 'relic_241'); ps.funds = 8;
    assert.deepEqual(m.handle(ps.playerId, { t: 'g.deathNote', name: boss.name, round: m.round }), { ok: true });
    m.startFinalAssault(false);
    assert.equal(m.bossPool.hp, 0);
    assert.ok(m.fields.every((f) => (f.spec?.flags || f.battle?.flags || f.opts?.flags)?.deathNoteEnemyKeys?.includes(boss.enemyKey)));
    h.run(() => m.ended);
    assert.equal(m.outcome.victory, true);
    assert.equal(ps.stats.bossDamage, 0);
    assert.deepEqual(h.logs.error, []);
  } finally { h.m.dispose(); }
});

test('死亡笔记：普通作战和联防的本人死亡由真实结算入口合并累计', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0'), helper = h.ps('p_1');
    ps.deathNoteDeaths = 28;
    ps.deathNoteLpLost = 10;
    const result = { perfect: true, leaked: [], deaths: 1, coins: 0, layerGains: {}, relicCompleted: true };
    h.m.lastResults = new Map([[ps.playerId, result], [helper.playerId, { ...result, deaths: 0 }]]);
    const plan = { leakers: [], helpers: [ps, helper], notReentered: new Map() };
    h.m.settle(plan, { perPlayer: { [ps.playerId]: { ...result, deaths: 1 }, [helper.playerId]: { ...result, deaths: 0 } } });
    assert.equal(ps.deathNoteDeaths, 30);
    assert.equal(ps.deathNoteLpLost, 10);
    assert.ok(ps.relics.some((r) => r.id === 'relic_241'));
    assert.equal(helper.deathNoteDeaths, 0);
  } finally { h.m.dispose(); }
});

test('死亡笔记：准备阶段每回合一次，写错扣8金币，拒绝重发、过期、无资金和非持有者请求', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    const ps = h.ps('p_0');
    h.toPrep(3); ps.funds = 24;
    const [key, rec] = Object.entries(h.m.gd.raw.enemies).find(([, rec]) => rec.name);
    assert.ok(ps.writeDeathNote(rec.name, 3).error);
    grantRelic(ps, 'relic_241');
    ps.ready = true;
    assert.ok(ps.writeDeathNote(rec.name, 3).error); ps.ready = false;
    assert.ok(ps.writeDeathNote(rec.name, 2).error);
    assert.ok(ps.writeDeathNote('   ', 3).error);
    assert.deepEqual(ps.writeDeathNote('a deliberately wrong name', 3), { ok: true });
    assert.equal(ps.funds, 16);
    assert.equal(ps.stats.gold, 8);
    assert.equal(ps.round.spent, 8);
    assert.deepEqual(deathNoteKeys(h.m), []);
    assert.ok(ps.writeDeathNote(rec.name, 3).error);
    assert.equal(ps.funds, 16);
    h.toPrep(4); ps.funds = 7;
    assert.ok(ps.writeDeathNote(rec.name, 4).error);
    ps.funds = 8;
    assert.deepEqual(ps.writeDeathNote(rec.name, 4), { ok: true });
    assert.equal(ps.funds, 0);
    assert.ok(deathNoteKeys(h.m).includes(key));
    assert.ok(resolveDeathNoteName(h.m, ` ${rec.name} `).includes(key));
    assert.deepEqual(resolveDeathNoteName(h.m, key), [], 'internal IDs are not enemy names');
    for (const owner of h.m.alivePlayers()) assert.deepEqual(h.m._normalOpts(owner).flags.deathNoteEnemyKeys, deathNoteKeys(h.m));
    assert.equal(ps.privateView().deathNote.used, true);
    assert.ok(!JSON.stringify(ps.privateView().deathNote).includes(key));
    h.toPrep(5);
    assert.deepEqual(deathNoteKeys(h.m), []);
    assert.equal(ps.privateView().deathNote.used, false);
    h.m.phase = PHASE.COMBAT;
    assert.ok(ps.writeDeathNote(rec.name, 5).error);
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) test(`死亡笔记：书写后立即刷新全队与已有观战预览，写错和下回合不移除（client=${clientCombat}）`, () => {
  const h = makeMatch({ humans: 3, fake: true, clientCombat, spectators: ['s_spec'] }).start();
  try {
    h.toPrep(1);
    const { m } = h;
    const owner = h.ps('p_0'), teammate = h.ps('p_1');
    grantRelic(owner, 'relic_241'); owner.funds = 16;
    const target = m.nextEnemiesFor(owner)[0].enemyKey;
    const name = m.gd.enemy(target).name;
    // Include a matching bounty too: all sources of this type disappear, while other rows stay intact.
    teammate.bounties.push({ id: 'note-preview', card: { enemyKey: target, count: 2, coin: 1 }, roundsLeft: 2 });
    for (const ps of m.alivePlayers()) ps.dirty();
    m.flush();
    const before = new Map(m.alivePlayers().map((ps) => [ps.playerId, h.lastTo(ps.playerId, 'm.private').nextEnemies]));
    assert.ok(before.get(teammate.playerId).some((e) => e.enemyKey === target && e.tag === 'bounty'));
    for (const pid of ['p_2', 's_spec']) assert.deepEqual(m.handle(pid, { t: 'g.watch', fieldId: 'n:p_1' }), { ok: true });
    const scoutCounts = ['p_2', 's_spec'].map((pid) => [pid, h.allTo(pid, 'm.field').length]);
    assert.deepEqual(m.handle(owner.playerId, { t: 'g.deathNote', name, round: 1 }), { ok: true });
    const removed = new Set(deathNoteKeys(m));
    assert.ok(removed.has(target));
    for (const ps of m.alivePlayers()) {
      assert.deepEqual(h.lastTo(ps.playerId, 'm.private').nextEnemies,
        before.get(ps.playerId).filter((e) => !removed.has(e.enemyKey)), `${ps.playerId}: the same request pushes the new preview`);
    }
    for (const [pid, count] of scoutCounts) {
      assert.equal(h.allTo(pid, 'm.field').length, count + 1, `${pid}: the existing scout refreshes immediately`);
      assert.deepEqual(h.lastTo(pid, 'm.field').nextEnemies, h.lastTo(teammate.playerId, 'm.private').nextEnemies);
    }
    assert.equal(h.allTo('s_spec', 'm.private').length, 0);
    h.toPrep(2);
    const next = new Map(m.alivePlayers().map((ps) => [ps.playerId, m.nextEnemiesFor(ps)]));
    assert.ok(next.get(teammate.playerId).some((e) => e.enemyKey === target && e.tag === 'bounty'), 'the next round restores the surviving bounty');
    owner.funds = 8;
    assert.deepEqual(m.handle(owner.playerId, { t: 'g.deathNote', name: 'a deliberately wrong name', round: 2 }), { ok: true });
    for (const ps of m.alivePlayers()) assert.deepEqual(m.nextEnemiesFor(ps), next.get(ps.playerId));
    assert.deepEqual(h.logs.error, []);
  } finally { h.m.dispose(); }
});

test('死亡笔记：首领准备预览同时移除各阵地的领袖与同类型悬赏', () => {
  const h = makeMatch({ humans: 3, fake: true }).start();
  try {
    h.toPrep(h.m.gd.bossRound);
    const { m } = h;
    const owner = h.ps('p_0');
    const boss = m.gd.raw.bosses[m.bossId];
    grantRelic(owner, 'relic_241'); owner.funds = 8;
    for (const ps of m.alivePlayers()) {
      ps.bounties.push({ id: `note-boss:${ps.playerId}`, card: { enemyKey: boss.enemyKey, count: 1 }, roundsLeft: 1 });
      ps.dirty();
    }
    m.flush();
    const before = new Map(m.alivePlayers().map((ps) => [ps.playerId, h.lastTo(ps.playerId, 'm.private').nextEnemies]));
    for (const rows of before.values()) assert.ok(rows.some((e) => e.boss && e.enemyKey === boss.enemyKey));
    assert.deepEqual(m.handle(owner.playerId, { t: 'g.deathNote', name: boss.name, round: m.round }), { ok: true });
    const removed = new Set(deathNoteKeys(m));
    for (const ps of m.alivePlayers()) {
      const expected = before.get(ps.playerId).filter((e) => !removed.has(e.enemyKey));
      assert.deepEqual(h.lastTo(ps.playerId, 'm.private').nextEnemies, expected);
      assert.deepEqual(m.prepFieldMeta(ps).nextEnemies, expected);
    }
    assert.deepEqual(h.logs.error, []);
  } finally { h.m.dispose(); }
});

// Keep the consumable slot occupied when isolating an ordinary relic in an otherwise exhausted catalogue.
function exhaustOtherRelics(ps, id) {
  // Exhaust only ordinary qualities; a negative collectible would change the battle being tested.
  ps.relics = RELICS.filter((r) => r.id !== id && r.tier !== 6).map((r) => ({ id: r.id, round: 1 }));
  grantRelic(ps, 'relic_235');
}

test('四叶草化石：R1精良可领取，持有后战后四选一，第四项可领取且不会跨局保留', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    const ps = h.ps('p_0');
    const id = 'relic_195';
    assert.equal(getRelic(id).tier, 2);
    exhaustOtherRelics(ps, id);
    h.toPrep(1);
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014']);
    assert.equal(ps.relics.some((r) => r.id === id), false);
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(selectRelic(ps, offer.id, 0).id, id);
    assert.equal(selectRelic(ps, offer.id, 0), null);
    ps.relics = ps.relics.filter((r) => r.id === id);
    h.toPrep(2);
    const next = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.equal(next.options.length, 4);
    assert.equal(new Set(next.options).size, 4);
    assert.ok(!next.options.includes(id));
    assert.equal(selectRelic(ps, next.id, 4), null);
    assert.equal(selectRelic(ps, next.id, 3).id, next.options[3]);
    assert.equal(ps.relics.length, 2);
    assert.equal(settleRelics(ps, { perfect: true, leaked: [] }, { completed: true }), null);
    // Other reward sources still use the default three candidates.
    assert.equal(pickRelicChoices(2, ps.relics, createRng(10)).length, 3);
  } finally { h.m.dispose(); }
  const fresh = makeMatch({ mode: 'solo', fake: true }).start();
  try { assert.deepEqual(fresh.ps('p_0').relics, []); } finally { fresh.m.dispose(); }
});

test('四叶草化石：仅持有者增加候选，重复ID不叠加，漏怪降级和不足四件仍遵守奖池规则', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    const owner = h.ps('p_0'), teammate = h.ps('p_1');
    grantRelic(owner, 'relic_195');
    owner.relics.push({ id: 'relic_195', round: 1 });
    h.toPrep(3);
    assert.equal(settleRelics(owner, { perfect: true, leaked: [] }, { completed: true }).options.length, 4);
    assert.equal(settleRelics(teammate, { perfect: true, leaked: [] }, { completed: true }).options.length, 3);
    owner.relicOffer = null;
    h.toPrep(4);
    const leaked = settleRelics(owner, { perfect: false, leaked: [{ counted: true }] }, { completed: true });
    assert.equal(leaked.reason, 'lowLoss');
    assert.equal(leaked.leaked, true);
    assert.equal(leaked.options.length, 4);
    assert.ok(leaked.options.every((id) => getRelic(id).tier <= 2));
    owner.relicOffer = null;
    exhaustOtherRelics(owner, 'relic_004');
    h.toPrep(5);
    assert.deepEqual(settleRelics(owner, { perfect: true, leaked: [] }, { completed: true }).options, ['relic_004', 'relic_014', 'relic_014', 'relic_014']);
  } finally { h.m.dispose(); }
});

test('河谷祭祈：史诗R7解锁，候选不生效，合法领取后下场增强爆发', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    const ps = h.ps('p_0');
    const id = 'relic_134';
    exhaustOtherRelics(ps, id);
    assert.equal(getRelic(id).tier, 4);
    assert.deepEqual(pickRelicChoices(6, ps.relics, createRng(19), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
    h.toPrep(7);
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014', 'relic_014']);
    const damage = () => {
      const input = ps.battleInput();
      const f = makeBattle({ players: [{ ...input, relics: input.relics.filter((r) => r === id), units: [] }],
        defs: { enemies: { target: enemyRec({ key: 'target', hp: 100000, speed: 0 }) } }, autoFinish: false });
      f.step();
      const e = f.spawn('target');
      const hp = e.hp;
      f.b.dealDamage(null, e, { type: 'element', element: 'burn', amount: 1000 });
      assert.deepEqual(f.b.errors, []);
      return hp - e.hp;
    };
    assert.equal(damage(), 7000);
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(selectRelic(ps, offer.id, 0).id, id);
    assert.equal(selectRelic(ps, offer.id, 0), null);
    assert.equal(damage(), 26600);
    assert.deepEqual(pickRelicChoices(7, ps.relics, createRng(19), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
  } finally { h.m.dispose(); }
});

test('四件击倒/部署藏品：普通R1候选，合法领取后下场生效并排除已持有', () => {
  for (const id of ['relic_116', 'relic_117', 'relic_118', 'relic_119']) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      const ps = h.ps('p_0');
      exhaustOtherRelics(ps, id);
      assert.equal(getRelic(id).tier, 1);
      h.toPrep(1);
      const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
      assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014', 'relic_014']);
      assert.equal(ps.battleInput().relics.includes(id), false);
      const probe = () => {
        const input = ps.battleInput();
        const f = makeBattle({ players: [{ ...input, relics: input.relics.filter((r) => r === id), units: [
          { uid: 1, kind: 'chess', chessId: 'reward_op', row: 10, col: 4 },
        ] }], defs: { chess: { reward_op: chessRec({ id: 'reward_op', position: 'RANGED', rangeGrid: [[0, 0]],
          skill: { spCost: 20, initSp: 0, spType: 'INCREASE_WHEN_ATTACK', trigger: { rule: 'NEVER' } },
          stats: { maxHp: 2000, atk: 500 } }) },
        enemies: { reward_target: enemyRec({ key: 'reward_target', hp: 100, speed: 0 }) } }, autoFinish: false });
        f.step();
        const u = f.unit(1);
        u.hp = 1000;
        const e = f.spawn('reward_target', { pos: [2, 4] });
        f.b.dealDamage(u, e, { amount: 1000, type: 'true' });
        assert.deepEqual(f.b.errors, []);
        return { aspd: u.s.aspd, sp: u.skill.sp, hp: u.hp, shield: u.findBuff('relic:119')?.shield ?? 0 };
      };
      assert.deepEqual(probe(), { aspd: 100, sp: 0, hp: 1000, shield: 0 });
      assert.equal(selectRelic(ps, 'forged', 0), null);
      assert.equal(selectRelic(ps, offer.id, 0).id, id);
      assert.equal(selectRelic(ps, offer.id, 0), null);
      assert.deepEqual(probe(), { aspd: id === 'relic_116' ? 200 : 100, sp: id === 'relic_117' ? 2 : 0,
        hp: id === 'relic_118' ? 1200 : 1000, shield: id === 'relic_119' ? 2000 : 0 });
      assert.deepEqual(pickRelicChoices(1, ps.relics, createRng(19), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
    } finally { h.m.dispose(); }
  }
});

test('黄金平原、第一法则：按指定品质解锁，合法领取后下场技能结束返还技力', () => {
  for (const [id, tier, round, amount] of [['relic_139', 3, 4, 2], ['relic_140', 4, 7, 4]]) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      const ps = h.ps('p_0');
      exhaustOtherRelics(ps, id);
      assert.equal(getRelic(id).tier, tier);
      assert.deepEqual(pickRelicChoices(round - 1, ps.relics, createRng(19), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014'], '正常掉落不提前解锁');
      h.toPrep(round);
      const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
      assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014', 'relic_014']);
      const battle = (input) => makeBattle({ players: [{ ...input, units: [
        { uid: 1, kind: 'chess', chessId: 'refund_guard', row: 10, col: 4 },
      ] }], defs: { chess: { refund_guard: chessRec({ id: 'refund_guard', skill: {
        duration: 0, spCost: 20, initSp: 0, spType: 'INCREASE_WHEN_ATTACK', trigger: { rule: 'NEVER' },
      } }) } }, autoFinish: false });
      const before = battle({ ...ps.battleInput(), relics: [] });
      before.step();
      before.unit(1).skill.activate('manual', { free: true });
      assert.equal(before.unit(1).skill.sp, 0, '候选不提供效果');
      assert.equal(ps.battleInput().relics.includes(id), false);
      assert.equal(selectRelic(ps, offer.id, 0).id, id);
      assert.equal(selectRelic(ps, offer.id, 0), null);
      const input = ps.battleInput();
      const next = battle({ ...input, relics: input.relics.filter((r) => r === id) });
      next.step();
      next.unit(1).skill.activate('manual', { free: true });
      assert.equal(next.unit(1).skill.sp, amount);
      assert.deepEqual(next.b.errors, []);
      assert.deepEqual(pickRelicChoices(round, ps.relics, createRng(19), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014'], '已领取不重复掉落');
    } finally { h.m.dispose(); }
  }
});

test('液体化肥、热辣可可、止痛片：按品质进入候选，合法领取后下场生效', () => {
  for (const [id, tier, round] of [['relic_125', 2, 1], ['relic_126', 3, 4], ['relic_127', 2, 1]]) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(round);
      const ps = h.ps('p_0');
      exhaustOtherRelics(ps, id);
      assert.equal(getRelic(id).tier, tier);
      const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
      assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014', 'relic_014']);
      assert.equal(ps.battleInput().relics.includes(id), false);
      assert.equal(selectRelic(ps, offer.id, 0).id, id);
      assert.equal(selectRelic(ps, offer.id, 0), null);
      // Leave the other owned IDs out of this mechanism check; the input itself comes from a legal claim.
      const input = ps.battleInput();
      const next = makeBattle({ players: [{ ...input, relics: input.relics.filter((r) => r === id), units: [
        { uid: 1, kind: 'chess', chessId: 'low_guard', row: 10, col: 4 },
      ] }], defs: { chess: { low_guard: chessRec({ id: 'low_guard', skill: null,
        stats: { maxHp: 2000, atk: 500 } }) } }, autoFinish: false });
      next.step();
      const u = next.unit(1);
      u.hp = 600;
      if (id === 'relic_125') {
        next.b.emit('attack', { attacker: u });
        assert.equal(u.hp, 550); assert.equal(u.findBuff('relic:125:barrier').shield, 100);
      } else if (id === 'relic_126') assert.equal(u.s.atk, 1250);
      else assert.equal(u.s.spRecovery, 3);
      assert.deepEqual(next.b.errors, []);
    } finally { h.m.dispose(); }
  }
});

test('护愈之手：史诗候选可合法领取，下场战斗生效且不重复领取', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(7);
    const ps = h.ps('p_0');
    exhaustOtherRelics(ps, 'relic_172');
    assert.equal(getRelic('relic_172').tier, 4);
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, ['relic_172', 'relic_014', 'relic_014', 'relic_014']);
    assert.equal(ps.battleInput().relics.includes('relic_172'), false);
    assert.equal(selectRelic(ps, offer.id, 0).id, 'relic_172');
    assert.equal(selectRelic(ps, offer.id, 0), null);
    const battle = makeBattle({ players: [{ ...ps.battleInput(), units: [
      { uid: 1, kind: 'chess', chessId: 'hand_medic', row: 10, col: 4 },
    ] }], defs: { chess: { hand_medic: chessRec({ id: 'hand_medic', profession: 'MEDIC', skill: null,
      rangeGrid: [[0, 0]], stats: { maxHp: 2000 } }) } }, autoFinish: false });
    battle.step();
    const u = battle.unit(1);
    assert.equal(battle.b.applyStatus(u, 'stun', { duration: 3 }), false);
    battle.b.heal(u, u, 100);
    assert.ok(u.findBuff('overheal')?.shield > 0);
    assert.deepEqual(battle.b.errors, []);
  } finally { h.m.dispose(); }
});

test('原创收藏品：实际奖励池抽取与领取后下一场战斗生效', () => {
  for (const id of ['relic_154', 'relic_155']) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(7);
      const ps = h.ps('p_0');
      // 耗尽其他藏品，让真实服务端奖励池只剩待验证新品。
      exhaustOtherRelics(ps, id);
      const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
      assert.deepEqual(offer.options, [id, 'relic_014', 'relic_014', 'relic_014']);
      const before = relicModifiers(ps.battleInput().relics, 'WARRIOR', 'MELEE');
      assert.ok(before[id === 'relic_154' ? 'resToDef' : 'defToRes']);
      assert.equal(selectRelic(ps, offer.id, 0).id, id);
      const input = ps.battleInput();
      const battle = makeBattle({ players: [{ ...input, units: [{ uid: 1, kind: 'chess', chessId: 'r_custom', row: 10, col: 4 }] }],
        defs: { chess: { r_custom: chessRec({ id: 'r_custom', skill: null, stats: { maxHp: 2000, atk: 500, def: 200, res: 10 } }) } }, autoFinish: false });
      battle.step();
      const unit = battle.unit(1);
      assert.equal(unit.s.def, 0, '领取第二件后移除全部防御');
      assert.equal(unit.s.res, 0, '领取第二件后移除全部法抗');
      assert.ok(Math.abs(unit.s.physTakenMul - 0.1) < 1e-9);
      assert.ok(Math.abs(unit.s.artsTakenMul - 0.1) < 1e-9);
      assert.equal(selectRelic(ps, offer.id, 0), null);
    } finally { h.m.dispose(); }
  }
});

test('淬毒匕首：稀有候选合法领取，下场战斗自动转换，候选/伪造领取不生效', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    const ps = h.ps('p_0');
    exhaustOtherRelics(ps, 'relic_240');
    assert.equal(getRelic('relic_240').tier, 3);
    assert.deepEqual(pickRelicChoices(3, ps.relics, createRng(1), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
    h.toPrep(4);
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.deepEqual(offer.options, ['relic_240', 'relic_014', 'relic_014', 'relic_014']);
    assert.equal(ps.battleInput().relics.includes('relic_240'), false);
    assert.equal(selectRelic(ps, 'forged', 0), null);
    assert.equal(selectRelic(ps, offer.id, 0).id, 'relic_240');
    assert.equal(selectRelic(ps, offer.id, 0), null);
    const next = makeBattle({ players: [{ ...ps.battleInput(), relics: ['relic_240'], units: [
      { uid: 1, kind: 'chess', chessId: 'claim_guard', row: 10, col: 4 },
    ] }], defs: { chess: { claim_guard: chessRec({ id: 'claim_guard', skill: null }) },
      enemies: { claim_dummy: enemyRec({ key: 'claim_dummy', hp: 10000, speed: 0 }) } }, autoFinish: false });
    next.step();
    const target = next.spawn('claim_dummy', { pos: [0, 0] });
    next.b.dealDamage(next.unit(1), target, { amount: 1000, type: 'phys' });
    assert.equal(target.hp, 10000);
    next.step(151);
    assert.ok(Math.abs(target.hp - 8900) < 1e-6);
    assert.equal(next.b.snapshot().poison, undefined);
    assert.deepEqual(next.b.errors, []);
    assert.deepEqual(pickRelicChoices(4, ps.relics, createRng(1), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
  } finally { h.m.dispose(); }
});

test('collection: weaker same-tier duplicates cannot be drawn or granted', () => {
  const removed = ['relic_007', 'relic_009', 'relic_008'];
  for (const id of removed) assert.equal(getRelic(id), null, id);
  assert.deepEqual(RELICS.filter((r) => r.tier === 1 && r.mods.defPct).map((r) => r.id), ['relic_047']);
  assert.deepEqual(RELICS.filter((r) => r.tier === 1 && r.mods.hpPct).map((r) => r.id), ['relic_010']);
  const owned = RELICS.filter((r) => !removed.includes(r.id)).map((r) => r.id);
  {
    assert.deepEqual(pickRelicChoices(15, owned, createRng(7), { multiplayer: true, hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
  }
  assert.deepEqual(relicModifiers(removed, 'WARRIOR', 'MELEE'), {});
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    for (const id of removed) assert.equal(grantRelic(ps, id), null, id);
    assert.deepEqual(ps.relics, []);
    for (const id of ['relic_047', 'relic_010']) assert.equal(grantRelic(ps, id).id, id);
  } finally { h.m.dispose(); }
});

test('collection: every tier is populated, early pools cannot run out during ordinary play, definitions are immutable', () => {
  assert.equal(RELICS.length, 76);
  assert.equal(new Set(RELICS.map((r) => r.id)).size, RELICS.length);
  assert.ok(RELICS.filter((r) => r.tier === 1).length >= 9);
  for (const { tier } of RELIC_TIERS.filter((t) => t.normalDrop !== false)) assert.ok(RELICS.some((r) => r.tier === tier));
  for (const r of RELICS) {
    assert.ok(r.name && r.desc && r.sourceEffect);
    assert.ok(Object.isFrozen(r) && Object.isFrozen(r.mods));
  }
  assert.equal(getRelic('__proto__'), null);
});

test('drops: locked tiers stay impossible, even when every unlocked collectible is already owned', () => {
  for (let round = 1; round <= 15; round++) {
    const rng = createRng(round);
    for (let i = 0; i < 1000; i++) {
      const r = pickRelic(round, [], rng);
      assert.ok(RELIC_TIERS[r.tier - 1].unlockRound <= round);
    }
    const allUnlocked = RELICS.filter((r) => RELIC_TIERS[r.tier - 1].unlockRound <= round);
    assert.equal(pickRelic(round, allUnlocked, rng, { hasScratchTicket: true }), null, 'an exhausted pool must never promote into a locked tier');
  }
  assert.equal(pickRelic(0, [], createRng(1)), null);
  assert.equal(pickRelic(1.5, [], createRng(1)), null);
});

test('drops: five-tier frequencies follow weights independently of unequal pool sizes', () => {
  const rng = createRng(20261003);
  const count = [0, 0, 0, 0, 0];
  const samples = 100000;
  for (let i = 0; i < samples; i++) count[pickRelic(13, [], rng).tier - 1]++;
  const weights = dropWeights(13);
  weights.forEach((weight, i) => assert.ok(Math.abs(count[i] / samples * 100 - weight) < 0.6, `${i + 1}: ${count[i]}`));
  assert.ok(count[1] > count[0], "后期精良出现概率高于普通");
});

test('drops: one uninterrupted perfect match earns distinct, progress-gated collectibles', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = createRng(seed);
    const owned = [];
    for (let round = 1; round <= 15; round++) {
      const r = pickRelic(round, owned, rng);
      assert.ok(r, `a real 15-round run never exhausts the eligible pool, seed ${seed} round ${round}`);
      assert.ok(r.scratchTicket || !owned.some((o) => o.id === r.id), 'only consumed tickets may repeat');
      owned.push({ id: r.id, round });
    }
  }
});

test('balance: duplicate IDs, forged payloads, profession and position add without cumulative caps', () => {
  const all = RELICS.map((r) => r.id);
  const mods = relicModifiers(all, 'WARRIOR', 'MELEE');
  const expected = { atkPct: 1.23, hpPct: 1.25, defPct: 1, aspd: 35, spRecoveryFlat: 0.75, hpRegen: 100, hpRegenRatio: 0.02, dodgePhys: 0.22, dodgeArts: 0.27, physDealtMul: 1.7, artsDealtMul: 1.6, healingTakenMul: 1.1, artsTakenMul: 0.1, physTakenMul: 0.1, defResClear: 1 };
  Object.assign(expected, { lowHpAtkPct: 1.5, lowHpSpRecoveryFlat: 2 });
  assert.deepEqual(Object.keys(mods).sort(), Object.keys(expected).sort());
  for (const [key, value] of Object.entries(expected)) assert.ok(Math.abs(mods[key] - value) < 1e-9, key);
  assert.deepEqual(relicModifiers(['relic_003', 'relic_003', 'unknown', { id: 'unknown', mods: { atkPct: 999 } }]), { atkPct: 0.08 });
  assert.deepEqual(relicModifiers(['relic_145', 'relic_050'], 'MEDIC', 'RANGED'), {});
  assert.equal(relicIncome(['relic_025', 'relic_025']), 1);
});

test('掉落进度：普通奖励按回合区间抽取', () => {
  assert.deepEqual(RELIC_TIERS.filter((r) => r.normalDrop !== false).map((r) => r.unlockRound), [1, 1, 4, 7, 7]);
  const normal = [
    [1, [80, 20, 0, 0, 0]], [3, [80, 20, 0, 0, 0]],
    [4, [60, 28, 12, 0, 0]], [6, [60, 28, 12, 0, 0]],
    [7, [50, 30, 15, 4, 1]], [9, [50, 30, 15, 4, 1]],
    [10, [20, 40, 25, 10, 5]], [12, [20, 40, 25, 10, 5]],
    [13, [10, 30, 35, 15, 10]], [15, [10, 30, 35, 15, 10]],
  ];
  normal.forEach(([round, weights]) => assert.deepEqual(dropWeights(round), weights));
});

for (const clientCombat of [false, true]) {
  test(`low-loss own battle and 联防 rescue each give one relic (${clientCombat ? 'client' : 'server'} combat)`, () => {
    const h = makeMatch({ humans: 2, fake: true, clientCombat,
      script: (b) => b.kind === 'normal' && b.round === 1 ? { leaks: { p_1: 1 } } : {} }).start();
    try {
      h.toPrep(1);
      const [p0, p1] = [h.ps('p_0'), h.ps('p_1')];
      const lp = p1.lp;
      h.toPrep(2);
      assert.equal(p1.lp, lp, 'helper caught the leaked enemy');
      assert.equal(p0.relics.length, 1);
      assert.equal(p1.relics.length, 1, 'rescue reduced actual LP loss to zero');
      assert.equal(getRelic(p1.relics[0].id).tier, 1, 'rescued personal leaks still lower quality');
      assert.equal(getRelic(p0.relics[0].id).tier, 1);
      assert.equal(p0.relics[0].round, 1);
      assert.deepEqual(p0.battleInput().relics, [p0.relics[0].id]);
      const watched = h.m.publicView().players.find((p) => p.playerId === p0.playerId);
      assert.deepEqual(watched.relics, p0.relics, 'spectators receive acquired ids and rounds');
      assert.equal(watched.nextLpShield, p0.privateView().nextLpShield);
      assert.equal(watched.relicOffer, undefined, 'private reward choices are not exposed');
      watched.relics[0].id = 'forged';
      assert.notEqual(p0.relics[0].id, 'forged', 'public collection cannot mutate authoritative state');
      const view = p0.privateView();
      view.relics[0].id = 'forged';
      assert.notEqual(p0.relics[0].id, 'forged', 'a wire view is isolated from authoritative state');
      h.toPrep(3);
      assert.equal(p0.relics.length, 2);
      assert.equal(p1.relics.length, 2);
      assert.deepEqual(p0.relicReward, p0.relics[1]);
      h.invariants();
      assert.equal(h.m.errorCount, 0);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}

test('settlement: repeated callbacks, missing/synthetic results, eliminated seats and non-completed battles never grant extras', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    const result = { perfect: true, leaked: [] };
    assert.equal(settleRelics(ps, null, { completed: true }), null);
    assert.equal(settleRelics(ps, result), null);
    assert.equal(settleRelics(ps, { ...result, synthetic: true }, { completed: true }), null);
    for (const lpLoss of [NaN, Infinity, -Infinity]) assert.equal(settleRelics(ps, result, { completed: true, lpLoss }), null);
    ps.alive = false;
    assert.equal(settleRelics(ps, result, { completed: true }), null);
    ps.alive = true;
    ps.left = true;
    assert.equal(settleRelics(ps, result, { completed: true }), null);
    ps.left = false;
    const offer = settleRelics(ps, result, { completed: true });
    assert.ok(offer);
    assert.equal(ps.relics.length, 0);
    assert.equal(settleRelics(ps, result, { completed: true }), null);
    assert.ok(selectRelic(ps, offer.id, 0));
    assert.equal(ps.relics.length, 1);
  } finally { h.m.dispose(); }
});

test('three distinct candidates exclude owned relics and follow round unlocks', () => {
  for (let round = 1; round <= 15; round++) for (let seed = 0; seed < 100; seed++) {
    const ids = pickRelicChoices(round, ['relic_003'], createRng(seed));
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    assert.ok(!ids.includes('relic_003'));
    ids.forEach((id) => assert.ok(RELIC_TIERS[getRelic(id).tier - 1].unlockRound <= round));
  }
});

test('perfect settlement waits for a player choice; forged/stale choices cannot award or advance, and solo selection is untimed', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    const ps = h.ps('p_0');
    const offer = ps.relicOffer;
    assert.equal(offer.options.length, 3);
    assert.equal(ps.relics.length, 0);
    assert.equal(h.m.deadline, 0);
    const wire = ps.privateView();
    wire.relicOffer.options[0] = 'forged';
    assert.notEqual(offer.options[0], 'forged');
    assert.equal(h.m.handle(ps.playerId, { t: 'g.relic', offerId: 'relic:other:1', idx: 0 }).error, 'BAD_TARGET');
    assert.equal(h.m.handle(ps.playerId, { t: 'g.relic', offerId: offer.id, idx: 3 }).error, 'BAD_TARGET');
    assert.equal(h.m.phase, PHASE.SETTLE);
    const chosen = offer.options[2];
    assert.ok(h.m.handle(ps.playerId, { t: 'g.relic', offerId: offer.id, idx: 2 }).ok);
    assert.deepEqual(ps.relics, [{ id: chosen, round: 1 }]);
    assert.equal(h.m.round, 2);
    assert.equal(h.m.handle(ps.playerId, { t: 'g.relic', offerId: offer.id, idx: 2 }).error, 'WRONG_PHASE');
  } finally { h.m.dispose(); }
});

test('multiplayer waits for each owner, rejects another seat offer, and defaults only outstanding choices at 30 seconds', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    const [a, b] = [h.ps('p_0'), h.ps('p_1')];
    const first = b.relicOffer.options[0];
    assert.equal(h.m.deadline - h.sched.now(), 30000);
    assert.equal(h.m.publicView().relicChoosing, true);
    assert.equal(h.m.statusOf(a), 'deciding');
    assert.equal(h.m.handle(a.playerId, { t: 'g.relic', offerId: b.relicOffer.id, idx: 0 }).error, 'BAD_TARGET');
    assert.ok(h.m.handle(a.playerId, { t: 'g.relic', offerId: a.relicOffer.id, idx: 2 }).ok);
    assert.equal(h.m.phase, PHASE.SETTLE);
    assert.equal(a.relics.length, 1);
    assert.equal(h.m.statusOf(a), 'done');
    assert.equal(b.relics.length, 0);
    assert.equal(h.m.handle(a.playerId, { t: 'g.relic', offerId: 'relic:0:1', idx: 2 }).error, 'BAD_TARGET');
    h.sched.advance(29999);
    assert.equal(h.m.round, 1);
    assert.equal(b.relics.length, 0);
    h.sched.advance(1);
    assert.equal(h.m.round, 2);
    assert.deepEqual(b.relics, [{ id: first, round: 1 }]);
    assert.equal(a.relics.length, 1);
    assert.equal(h.m.publicView().relicChoosing, false);
    assert.equal(h.m.errorCount, 0);
  } finally { h.m.dispose(); }
});

for (const action of ['disconnect', 'autoplay', 'leave']) test(`an outstanding relic choice cannot stall multiplayer after ${action}`, () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    assert.ok(h.drive(() => h.m.phase === PHASE.SETTLE));
    const [a, b] = [h.ps('p_0'), h.ps('p_1')];
    h.m.handle(a.playerId, { t: 'g.relic', offerId: a.relicOffer.id, idx: 0 });
    if (action === 'disconnect') h.m.onDisconnect(b.playerId);
    else if (action === 'autoplay') h.m.handle(b.playerId, { t: 'g.autoplay', on: true });
    else h.m.onLeave(b.playerId);
    assert.equal(h.m.round, 2);
    assert.equal(b.relics.length, action === 'leave' ? 0 : 1);
    assert.equal(h.m.publicView().relicChoosing, false);
    assert.equal(h.m.errorCount, 0);
    h.m.onReconnect(b.playerId);
    assert.equal(b.relics.length, action === 'leave' ? 0 : 1);
  } finally { h.m.dispose(); }
});

test('relic requests carry a bounded index and offer identity', () => {
  for (const idx of [0, 1, 2, 3]) {
    assert.equal(validateC2S({ t: 'g.relic', offerId: 'relic:0:1', idx }), null);
  }
  for (const fields of [{ idx: 4 }, { idx: -1 }, { idx: 1.5 }, { idx: '3' }, { offerId: '' }, { offerId: 'a'.repeat(65) }]) {
    assert.ok(validateC2S({ t: 'g.relic', offerId: 'relic:0:1', idx: 0, ...fields }));
  }
});

test('boss shield credits raw client LP only once, preserves fallback acknowledgments, and does not use another field shield', () => {
  const h = makeMatch({ humans: 2, fake: true }).start();
  try {
    h.toPrep(1);
    const [a, b] = [h.ps('p_0'), h.ps('p_1')];
    a.relicShield = b.relicShield = 2;
    a.relicShieldRound = b.relicShieldRound = 1;
    h.m.teamLp = 10;
    h.m._bossLpBudget = () => 100;
    const f = { players: [a.playerId], lpReported: 0, lpAcked: 0, lpCum: 0 };
    h.m._creditLp(f, 3, true);
    assert.equal(h.m.teamLp, 9);
    assert.equal(a.relicShield, 0);
    assert.equal(b.relicShield, 2);
    h.m._creditLp(f, 3, true);
    assert.equal(h.m.teamLp, 9);
    h.m._creditLp(f, 3);
    assert.equal(h.m.teamLp, 9, 'fallback replay does not charge already-acknowledged leaks');
    h.m._creditLp(f, 1);
    assert.equal(h.m.teamLp, 8);
    h.m._teamLpLoss(2, [b.playerId]);
    assert.equal(h.m.teamLp, 8);
    assert.equal(b.relicShield, 0);
  } finally { h.m.dispose(); }
});

test('normal combat engine failure cannot fabricate a perfect-round reward', () => {
  const h = makeMatch({ mode: 'solo', fake: true, script: () => ({ throwInCtor: true }) }).start();
  try {
    h.toPrep(2);
    assert.equal(h.ps('p_0').relics.length, 0);
  } finally { h.m.dispose(); }
});

test('economy and lifetime: fixed income starts in the next prep; results retain collection and a fresh match resets it', () => {
  const h = makeMatch({ mode: 'solo', fake: true }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.relics.push({ id: 'relic_025', round: 7 });
    ps.funds = 0;
    ps.startRound(8);
    assert.equal(ps.funds, h.m.gd.income(8) + 1);
    h.m.finish({ victory: false, reason: 'abandoned' });
    assert.deepEqual(h.ended.players[0].relics, [{ id: 'relic_025', round: 7 }]);
    const fresh = makeMatch({ mode: 'solo', fake: true });
    assert.deepEqual(fresh.ps('p_0').relics, []);
    fresh.m.dispose();
  } finally { h.m.dispose(); }
});

for (const clientCombat of [false, true]) {
  test(`only a low-loss boss win leading to Hidden Core awards a relic (${clientCombat ? 'client' : 'server'} combat)`, () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true, clientCombat,
      script: (b) => b.kind === 'boss' || b.kind === 'hidden' ? { bossDps: 1e8, duration: Infinity } : {} }).start();
    try {
      h.toPrep(1);
      h.ps('p_0').lp = 999;
      h.toPrep(14);
      // Use the real active-bond layer gate; endPrep recomputes hiddenLayerSum from player bonds.
      const ps = h.ps('p_0');
      ps.bondCountBonus.yanShip = 3;
      ps.layers.yanShip = 600;
      ps.recompute();
      assert.ok(h.m.hiddenBossId);
      assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 15));
      assert.ok(h.ps('p_0').relics.some((r) => r.round === 14));
      assert.ok(h.drive(() => !!h.ended));
      const relics = h.ended.players[0].relics;
      assert.equal(relics.filter((r) => r.round === 15).length, 0);
      assert.equal(relics.length, 14);
      assert.equal(new Set(relics.map((r) => r.id)).size, 14);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}

test('a defeated boss battle or a victory without a next stage gives no relic', () => {
  for (const victory of [false, true]) {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true,
      script: (b) => b.kind === 'boss' ? { bossDps: victory ? 1e8 : 0, duration: Infinity,
        leaks: victory ? { p_0: 1 } : {} } : {} }).start();
    try {
      h.toPrep(14);
      h.ps('p_0').lp = 1;
      assert.ok(h.drive(() => !!h.ended));
      assert.equal(h.ended.victory, victory);
      assert.equal(h.ended.players[0].relics.filter((r) => r.round === 14).length, 0);
    } finally { h.m.dispose(); }
  }
});

for (const clientCombat of [false, true]) {
  test(`a surviving co-op player with a zero LP share gets no relic after the final stage (${clientCombat ? 'client' : 'server'})`, () => {
    const h = makeMatch({ humans: 2, difficulty: 'NORMAL', fake: true, clientCombat,
      script: (b) => b.kind === 'boss' ? { bossDps: 1e8, duration: Infinity } : {} }).start();
    try {
      h.toPrep(14);
      h.ps('p_0').lp = 1;
      h.ps('p_1').lp = 0; // shared pool still has one LP; this seat has not been eliminated
      assert.ok(h.drive(() => !!h.ended));
      assert.equal(h.ended.victory, true);
      assert.equal(h.ended.teamLp, 1);
      const p = h.ended.players.find((p) => p.playerId === 'p_1');
      assert.equal(p.alive, true);
      assert.equal(p.lp, 0);
      assert.equal(p.relics.filter((r) => r.round === 14).length, 0);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}

for (const clientCombat of [false, true]) for (const leaks of [0, 5, 6, 40]) {
  test(`collectible threshold uses actual loss: ${leaks} leaks (${clientCombat ? 'client' : 'server'})`, () => {
    const h = makeMatch({ mode: 'solo', fake: true, clientCombat,
      script: (b) => b.kind === 'normal' ? { leaks: { p_0: leaks } } : {} }).start();
    try {
      h.toPrep(1);
      const ps = h.ps('p_0'), lp = ps.lp;
      h.toPrep(2);
      assert.equal(ps.lp, lp - Math.min(10, leaks));
      assert.equal(ps.relics.length, leaks <= 5 ? 1 : 0);
      assert.equal(ps.privateView().lpShield, 0);
      assert.equal(ps.privateView().nextLpShield, 0);
      assert.equal(h.m.errorCount, 0);
    } finally { h.m.dispose(); h.clients?.closeAll(); }
  });
}
for (const clientCombat of [false, true]) test(`consecutive losses never grant compensation (${clientCombat ? 'client' : 'server'})`, () => {
  const h = makeMatch({ mode: 'solo', fake: true, clientCombat,
    script: (b) => b.kind === 'normal' ? { leaks: { p_0: 6 } } : {} }).start();
  try {
    h.toPrep(1);
    const ps = h.ps('p_0');
    ps.lp = 100;
    h.toPrep(5);
    assert.equal(ps.lp, 76);
    assert.deepEqual(ps.relics, []);
    assert.equal(ps.privateView().lpShield, 0);
    assert.equal(ps.privateView().nextLpShield, 0);
    assert.equal(h.m.errorCount, 0);
  } finally { h.m.dispose(); h.clients?.closeAll(); }
});

for (const loss of [5, 6]) test(`boss collectible threshold uses allocated LP loss ${loss}`, () => {
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true,
    script: (b) => b.kind === 'boss' ? { bossDps: 1e8, duration: Infinity } : {} }).start();
  try {
    h.toPrep(1);
    h.ps('p_0').lp = 999;
    h.toPrep(14);
    const ps = h.ps('p_0');
    ps.bondCountBonus.yanShip = 3;
    ps.layers.yanShip = 600;
    ps.recompute();
    assert.ok(h.drive(() => h.m.phase === PHASE.FINAL_ASSAULT));
    h.m._teamLpLoss(loss);
    assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 15));
    assert.equal(ps.relics.some((r) => r.round === 14), loss <= 5);
  } finally { h.m.dispose(); }
});

test('漏怪掉落：品质概率下移一级，普通合并且不出现传说', () => {
  for (const [round, expected] of [
    [1, [100, 0, 0, 0, 0]], [3, [100, 0, 0, 0, 0]],
    [4, [88, 12, 0, 0, 0]], [6, [88, 12, 0, 0, 0]],
    [7, [80, 15, 4, 1, 0]], [9, [80, 15, 4, 1, 0]],
    [10, [60, 25, 10, 5, 0]], [12, [60, 25, 10, 5, 0]],
    [13, [40, 35, 15, 10, 0]], [15, [40, 35, 15, 10, 0]],
  ]) assert.deepEqual(dropWeights(round, { leaked: true }), expected);
  for (const round of [0, -1, 1.5]) assert.deepEqual(dropWeights(round, { leaked: true }), [0, 0, 0, 0, 0]);
  for (const [roll, tier] of [[0, 1], [0.799999, 1], [0.8, 2], [0.949999, 2], [0.95, 3], [0.989999, 3], [0.99, 4], [0.999999, 4]]) {
    const choices = pickRelicChoices(7, [], () => roll, { leaked: true });
    assert.equal(choices.length, 3);
    assert.ok(choices.every((id) => getRelic(id).tier === tier));
  }
  const owned = RELICS.filter((r) => r.tier <= 4).map((r) => r.id);
  assert.deepEqual(pickRelicChoices(15, owned, createRng(7), { leaked: true, hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014'], 'exhausted lower tiers cannot restore legendary drops');
});

test('漏怪降级以本人计数漏怪为准，联防救回不抹除，非计数对象不触发', () => {
  for (const [leaked, penalty] of [[[], false], [[{ counted: false }], false], [[{}], true], [[{ counted: true }], true]]) {
    const h = makeMatch({ mode: 'solo', fake: true }).start();
    try {
      h.toPrep(1);
      h.m.round = 3;
      const ps = h.ps('p_0');
      const offer = settleRelics(ps, { perfect: !penalty, leaked }, { completed: true, lpLoss: 0 });
      assert.ok(offer);
      assert.equal(offer.leaked, penalty);
      if (penalty) assert.ok(offer.options.every((id) => getRelic(id).tier === 1));
    } finally { h.m.dispose(); }
  }
});
