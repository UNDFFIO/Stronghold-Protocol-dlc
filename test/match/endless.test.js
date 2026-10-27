import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { FakeBattle } from './fakeBattle.js';
import { Battle } from '../../server/sim/Battle.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';

function atVote(t, options = {}) {
  const h = makeMatch({ fake: true, ...options }).start();
  t.after(() => h.m.dispose());
  h.m.setDeadline(0);
  h.m.round = h.m.gd.hiddenRound;
  h.m.hiddenReached = true;
  for (const p of h.m.order) p.lp = 100;
  h.m.openEndlessVote();
  return h;
}

function accept(h) {
  for (const id of [...h.m.endlessVote.voters]) assert.deepEqual(h.m.handle(id, { t: 'g.endlessVote', agree: true }), { ok: true });
}

test('continuation requires all surviving humans; bots follow, spectators cannot vote; reconnect restores progress', t => {
  const h = atVote(t, { humans: 2, bots: 1, spectators: [{ playerId: 's', name: 'S' }] });
  assert.equal(validateC2S({ t: 'g.endlessVote', agree: true }), null);
  assert.ok(validateC2S({ t: 'g.endlessVote', agree: 1 }));
  assert.deepEqual(h.m.endlessVote.voters, ['p_0', 'p_1']);
  h.m.handle('p_0', { t: 'g.endlessVote', agree: true });
  assert.equal(h.m.phase, PHASE.CONTINUE_VOTE);
  h.m.onDisconnect('p_1');
  assert.ok(h.m.handle('p_1', { t: 'g.endlessVote', agree: true }).error);
  assert.ok(h.m.handle('s', { t: 'g.endlessVote', agree: true }).error);
  h.m.onReconnect('p_1');
  assert.deepEqual(h.lastTo('p_1', 'm.public').endlessVote.agreed, ['p_0']);
  h.m.handle('p_1', { t: 'g.endlessVote', agree: true });
  assert.equal(h.m.round, 16);
  assert.equal(h.m.phase, PHASE.ROUND_START);
  assert.equal(h.endedCount, 0);
  assert.ok(h.m.handle('p_0', { t: 'g.endlessVote', agree: true }).error);
});

for (const action of ['decline', 'timeout', 'leave']) test(`${action} settles the Hidden Core clear exactly once`, t => {
  const h = atVote(t, { humans: 2 });
  if (action === 'decline') h.m.handle('p_0', { t: 'g.endlessVote', agree: false });
  if (action === 'timeout') { h.m.onDisconnect('p_1'); h.sched.advance(h.m.scaled(30_000)); }
  if (action === 'leave') h.m.onLeave('p_0');
  assert.equal(h.ended.victory, true);
  assert.equal(h.ended.hiddenCleared, true);
  assert.equal(h.endedCount, 1);
  assert.equal(h.ended.extraRounds, undefined);
});

test('solo voting has no timeout and acceptance preserves LP, inventory and starts a populated +5% wave', t => {
  const h = atVote(t, { mode: 'solo' });
  const p = h.ps('p_0');
  p.layers.yanShip = 400;
  assert.equal(h.m.deadline, 0);
  accept(h);
  assert.equal(p.lp, 100);
  assert.equal(p.layers.yanShip, 400);
  assert.ok(h.m.wave.spawns.length > 0);
  assert.ok(h.m.wave.pick);
  assert.equal(h.m.gd.endlessScale(16), 1.05);
  assert.equal(h.m.gd.endlessScale(17), 1.1);
  assert.equal(h.m.gd.endlessScale(35), 2);
  const opts = h.m._normalOpts(p);
  assert.equal(opts.flags.endlessEnemyScale, 1.05);
  assert.equal(buildBattleSpec(opts).flags.endlessEnemyScale, 1.05);
  assert.equal(h.m.teamLp, null, 'normal rounds resume personal LP accounting');
});

test('zero personal shares after a boss pool are eliminated before extra prep without losing the saved clear', t => {
  const h = atVote(t, { humans: 2 });
  h.ps('p_0').lp = 1;
  h.ps('p_1').lp = 0;
  accept(h);
  assert.equal(h.ps('p_1').alive, false);
  assert.equal(h.ps('p_0').lp, 1);
  h.invariants();
  h.m.finish({ victory: false });
  assert.equal(h.ended.players[1].victory, true);
  assert.equal(h.ended.players[1].extraRounds, 0);
});

test('every sixth extra round draws a valid boss; real templates and the increased pool survive into battle', t => {
  const h = atVote(t, { mode: 'solo' });
  accept(h);
  const seen = new Set();
  for (const round of [21, 27, 33, 39, 45, 51]) {
    h.m.startRound(round);
    const id = h.m.endless.bossId;
    seen.add(id);
    assert.ok(h.m.gd.bossWeights(false).some(([candidate]) => candidate === id));
    assert.ok(h.m.bossWaves[0].wave.spawns.some(s => s.tag === 'boss'));
    assert.equal(h.m.publicView().extraBossRound, true);
  }
  assert.ok(seen.size > 1, 'bosses are drawn anew rather than repeating the opening boss');
  h.m.startRound(21);
  const id = h.m.endless.bossId;
  h.m.setDeadline(0);
  h.m.phase = PHASE.PREP;
  h.m.endPrep();
  assert.equal(h.m.phase, PHASE.FINAL_ASSAULT);
  assert.equal(h.m.bossPool.maxHp, bossPoolHp(h.m.gd, id, 1) * 1.3);
  assert.equal(FakeBattle.instances.at(-1).opts.flags.endlessEnemyScale, 1.3);
});

for (const clientCombat of [false, true]) test(`hidden win opens the vote, extra boss win resumes and loss keeps success (${clientCombat ? 'client' : 'server'})`, t => {
  const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true, clientCombat,
    script: b => b.kind === 'boss' || b.kind === 'hidden' ? { bossDps: b.round < 27 ? 1e8 : 0 } : {} }).start();
  t.after(() => h.m.dispose());
  h.toPrep(1);
  h.ps('p_0').lp = 999;
  h.m.hiddenReached = true;
  h.m._openTeamLp();
  h.m.startRound(15);
  assert.ok(h.drive(() => h.m.phase === PHASE.CONTINUE_VOTE));
  assert.equal(h.ended, null);
  accept(h);
  assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 22));
  assert.equal(h.m.endless.cleared, 6);
  assert.ok(h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 27));
  h.ps('p_0').lp = 2;
  h.ps('p_0').relics = [];
  h.ps('p_0').relicReverseLpRound = 0;
  assert.ok(h.drive(() => !!h.ended));
  assert.equal(h.ended.victory, true);
  assert.equal(h.ended.hiddenCleared, true);
  assert.equal(h.ended.extraRounds, 11);
  assert.equal(h.ended.players[0].victory, true);
  assert.equal(h.ended.roundsPassed, 15);
});

test('ordinary extra-round elimination retains individual clear and caps base rewards; eliminated earlier players do not gain a clear', t => {
  const h = atVote(t, { humans: 3 });
  // An earlier elimination never becomes a continuation voter or a saved winner.
  h.m.endlessVote = null;
  h.ps('p_2').eliminate(6);
  h.m.openEndlessVote();
  accept(h);
  h.m.startRound(18);
  h.m.endless.cleared = 2;
  h.ps('p_0').lp = 0;
  h.ps('p_1').lp = 0;
  h.m.eliminateBroken();
  h.m.afterSettle();
  assert.equal(h.ended.victory, true);
  assert.equal(h.ended.extraRounds, 2);
  assert.equal(h.ended.players[0].victory, true);
  assert.equal(h.ended.players[0].roundsPassed, 15);
  assert.equal(h.ended.players[0].extraRounds, 2);
  assert.equal(h.ended.players[2].victory, false);
  assert.equal(h.ended.players[2].roundsPassed, 5);
});

test('real engine applies additive scaling once to scheduled, inherited and Unite spawns, including a browser spec', () => {
  const key = Object.keys(DATA.enemies).find(k => DATA.enemies[k]?.stats?.maxHp > 100);
  assert.ok(key);
  const opts = { data: DATA, content: 'none', autoFinish: false, kind: 'normal', round: 17,
    flags: { endlessEnemyScale: 1.1 }, players: [], spawns: [], stageId: Object.keys(DATA.stages)[0] };
  const plain = new Battle({ ...opts, flags: {} });
  const grown = new Battle(opts);
  const a = plain.spawnEnemy(key, { mods: { hpMul: 2, atkMul: 3 } });
  const b = grown.spawnEnemy(key, { mods: { hpMul: 2, atkMul: 3 } });
  assert.equal(b.base.maxHp, a.base.maxHp * 1.1);
  assert.equal(b.base.atk, a.base.atk * 1.1);
  const child = grown.spawnEnemy(key, { mods: b.mods });
  assert.equal(child.base.maxHp, b.base.maxHp);
  const unite = new Battle({ ...opts, kind: 'unite' });
  assert.equal(unite.spawnEnemy(key, { mods: b.mods }).base.maxHp, b.base.maxHp);
  const spec = buildBattleSpec({ ...opts, spawns: [{ enemyKey: key, mods: b.mods }] });
  const browser = createBattleFromSpec(spec, DATA);
  browser.start();
  browser.step();
  assert.equal(browser.enemies[0].base.maxHp, b.base.maxHp);
});
