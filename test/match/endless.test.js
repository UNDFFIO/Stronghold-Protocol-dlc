import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA, giveItem } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { SharedPool } from '../../server/match/pool.js';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { FakeBattle } from './fakeBattle.js';
import { Battle } from '../../server/sim/Battle.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { RELICS, pickRelic, pickRelicChoices, relicIncome } from '../../shared/relics.js';
import { settleRelics, selectRelic, autoSelectRelic, grantRelic } from '../../server/match/relics.js';

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

const EXTRA_BLOCKED_RELICS = ['relic_159', 'relic_157', 'relic_156'];

test('extra-round relic pools exclude the three restricted collectibles even when all other candidates are exhausted', () => {
  for (const id of EXTRA_BLOCKED_RELICS) {
    const owned = RELICS.filter(r => r.id !== id).map(r => ({ id: r.id, round: 1 }));
    const opts = { multiplayer: true, hasScratchTicket: true };
    assert.deepEqual(pickRelicChoices(15, owned, () => 0, opts), [id, 'relic_014', 'relic_014'], `${id} remains available before continuation`);
    for (const extraRound of [1, 6, 22]) {
      assert.deepEqual(pickRelicChoices(15 + extraRound, owned, () => 0, { ...opts, extraRound }), ['relic_014', 'relic_014', 'relic_014']);
      assert.equal(pickRelic(15 + extraRound, owned, () => 0,
        { ...opts, extraRound, tierWeights: [5, 65, 30, 0, 0] }), null, 'explicit reward weights also respect eligibility');
    }
  }
});

for (const mode of ['solo', 'coop']) test(`${mode}: extra-round battle rewards and direct, manual and automatic grants enforce relic exclusions`, t => {
  const h = atVote(t, { mode });
  const p = h.ps('p_0');
  accept(h);
  const difficulty = h.m.difficultyLevel;
  for (const id of EXTRA_BLOCKED_RELICS) {
    assert.equal(grantRelic(p, id, { round: 1 }), null, 'backdating cannot bypass the current round gate');
    p.relicOffer = { id: `forged:${id}`, round: h.m.round, options: [id] };
    assert.equal(selectRelic(p, p.relicOffer.id, 0), null);
    autoSelectRelic(p);
    assert.ok(!p.relics.some(r => r.id === id));
  }
  assert.equal(h.m.difficultyLevel, difficulty, 'blocked phone cannot change difficulty');
  p.relicOffer = null;
  // Only the restricted trio and one valid permanent collectible remain. Fill the consumable slot legitimately.
  const allowed = 'relic_025';
  p.relics = RELICS.filter(r => !EXTRA_BLOCKED_RELICS.includes(r.id) && r.id !== allowed).map(r => ({ id: r.id, round: 1 }));
  grantRelic(p, 'relic_235');
  const offer = settleRelics(p, { perfect: true, leaked: [] }, { completed: true, lpLoss: 0 });
  assert.deepEqual(offer.options, [allowed, 'relic_014', 'relic_014', 'relic_014']);
  assert.equal(selectRelic(p, offer.id, 0).id, allowed, 'other collectibles remain obtainable');
});

test('entering extra rounds preserves already held restricted relics and the stick income', t => {
  const h = atVote(t, { mode: 'coop', difficulty: 'ASCENSION', difficultyLevel: 10 });
  const p = h.ps('p_0');
  for (const id of EXTRA_BLOCKED_RELICS) assert.equal(grantRelic(p, id).id, id);
  const difficulty = h.m.difficultyLevel;
  const before = p.funds;
  accept(h);
  assert.ok(EXTRA_BLOCKED_RELICS.every(id => p.relics.some(r => r.id === id)));
  assert.equal(h.m.difficultyLevel, difficulty);
  assert.equal(relicIncome(p.relics), 2);
  assert.equal(p.funds - before, h.m.gd.income(h.m.round) + 2);
});

test('extra challenges remove exactly two operator slots at every shop level and retain item slots in every mode', () => {
  for (const modeId of Object.keys(DATA.config.modes)) {
    const gd = new GameData(DATA, modeId);
    const start = Math.max(16, (gd.hiddenRound ?? gd.bossRound) + 1);
    const normal = Array.from({ length: 6 }, (_, i) => gd.shopSlots(i + 1, start));
    gd.endlessStartRound = start;
    for (let level = 1; level <= 6; level++) {
      assert.deepEqual(gd.shopSlots(level, start - 1), normal[level - 1]);
      for (const round of [start, start + 5, start + 21]) {
        assert.deepEqual(gd.shopSlots(level, round), { chess: normal[level - 1].chess - 2, item: normal[level - 1].item });
      }
    }
  }
});

test('shop draws exclude Thrifty Doll only during extra rounds, with fallback and bond bias still working', () => {
  const gd = new GameData(DATA, 'mode_single_funny');
  const doll = 'chess_item_2_05_e_a';
  const other = gd.shopItemsByTier[1][0];
  // A controlled candidate list makes selecting the doll certain before continuation.
  gd.shopItemsByTier = { 1: [doll, other] };
  gd.endlessStartRound = gd.hiddenRound + 1;
  const pool = new SharedPool(gd);
  assert.equal(pool.rollItem(() => 0, 1, null, null, gd.hiddenRound), doll);
  assert.equal(pool.rollItem(() => 0, 1, null, null, gd.endlessStartRound), other);
  assert.equal(pool.rollItem(() => 0, 1, null, new Set(['yanShip']), gd.endlessStartRound), other);
  assert.equal(gd.shopItemAllowed('chess_item_2_05_e_b', gd.endlessStartRound), false);
  gd.shopItemsByTier = { 2: [doll] };
  assert.equal(pool.rollItem(() => 0, 1, null, null, gd.endlessStartRound), null, 'exhausted candidates cannot restore the doll');
});

test('entering extra rounds shrinks frozen shops, replaces frozen dolls, preserves inventory, and uses the reduced layout on refresh and upgrade', t => {
  const h = atVote(t, { mode: 'solo' });
  const p = h.ps('p_0');
  const doll = 'chess_item_2_05_e_a';
  const owned = giveItem(h.m, p, doll);
  p.rollShop();
  const before = { ...p.shop.layout };
  p.shop.frozen = true;
  for (const slot of p.shop.slots) if (slot) slot.frozen = true;
  const kept = p.shop.slots.slice(0, before.chess - 2).map(s => s?.id);
  p.shop.slots[before.chess] = { kind: 'item', id: doll, basePrice: 3, sold: false, frozen: true };
  accept(h);
  assert.deepEqual(p.shop.layout, { chess: before.chess - 2, item: before.item });
  assert.deepEqual(p.shop.slots.slice(0, p.shop.layout.chess).map(s => s?.id), kept);
  assert.ok(p.shop.slots.every(s => !s || s.id !== doll));
  assert.ok(p.find(owned.uid), 'owned doll remains in inventory');
  h.toPrep(h.m.round);
  p.funds = 100;
  assert.deepEqual(p.refresh(), { ok: true });
  assert.deepEqual(p.privateView().shop.layout, p.shop.layout);
  assert.equal(p.shop.slots.length, before.chess - 2 + before.item);
  assert.ok(p.shop.slots.every(s => !s || s.id !== doll));
  assert.deepEqual(p.levelUp(), { ok: true });
  assert.deepEqual(p.shop.layout, h.m.gd.shopSlots(p.shop.level, h.m.round));
  assert.deepEqual(p.refresh(), { ok: true });
  h.invariants();
});

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

test('solo voting has no timeout and acceptance preserves LP, inventory and starts a populated +10% wave', t => {
  const h = atVote(t, { mode: 'solo' });
  const p = h.ps('p_0');
  p.layers.yanShip = 400;
  assert.equal(h.m.deadline, 0);
  accept(h);
  assert.equal(p.lp, 100);
  assert.equal(p.layers.yanShip, 400);
  assert.ok(h.m.wave.spawns.length > 0);
  assert.ok(h.m.wave.pick);
  assert.equal(h.m.gd.endlessScale(16), 1.1);
  assert.equal(h.m.gd.endlessScale(17), 1.2);
  assert.equal(h.m.gd.endlessScale(15), 1);
  for (let n = 1; n <= 10; n++) assert.equal(h.m.gd.endlessScale(15 + n), 1 + n * 0.1);
  assert.ok(Math.abs(h.m.gd.endlessScale(26) - 2.3) < 1e-12, 'extra round 11 compounds from round 10');
  assert.ok(Math.abs(h.m.gd.endlessScale(27) - 2.645) < 1e-12, 'extra boss round 12 keeps compound growth');
  assert.ok(Math.abs(h.m.gd.endlessScale(35) - 8.091115471416) < 1e-12, 'extra round 20');
  const opts = h.m._normalOpts(p);
  assert.equal(opts.flags.endlessEnemyScale, 1.1);
  assert.equal(buildBattleSpec(opts).flags.endlessEnemyScale, 1.1);
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
  for (const [round, scale] of [[21, 1.6], [27, 2 * 1.15 ** 2]]) {
    h.m.startRound(round);
    const id = h.m.endless.bossId;
    h.m.setDeadline(0);
    h.m.phase = PHASE.PREP;
    h.m.endPrep();
    assert.equal(h.m.phase, PHASE.FINAL_ASSAULT);
    assert.equal(h.m.bossPool.maxHp, bossPoolHp(h.m.gd, id, 1) * scale);
    assert.equal(FakeBattle.instances.at(-1).opts.flags.endlessEnemyScale, scale);
  }
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
