import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { grantRelic, selectRelic, settleRelics } from '../../server/match/relics.js';
import { RELICS, pickRelicChoices, pickRelic, canReceiveRelic } from '../../shared/relics.js';
import { SCRATCH_TIERS, SCRATCH_MULTIPLIERS, drawScratchTicket } from '../../shared/scratchTickets.js';
import { createRng } from '../../server/sim/rng.js';
import { PHASE } from '../../shared/constants.js';
import { validateC2S } from '../../shared/protocol.js';
import { attachAudit } from '../../server/match/audit.js';
import { botPrepBeginSteps } from '../../server/match/bot.js';

const setup = (opts = {}) => {
  const h = makeMatch({ mode: 'solo', fake: true, ...opts }).start(); h.toPrep(7);
  for (const ps of h.m.players.values()) { ps.relics = []; ps.scratchSeq = 0; ps.scratchTicket = null; ps.scratchResult = null; }
  return h;
};

test('scratch tables: exact boundary weights, payouts, return rates and matching-number sums', () => {
  const returns = [64.3, 70.7, 77.1, 83.5, 89.9];
  for (const spec of SCRATCH_TIERS) {
    assert.equal(spec.weights.reduce((a, b) => a + b), 10000);
    assert.equal(Number((spec.weights.reduce((sum, w, i) => sum + w * SCRATCH_MULTIPLIERS[i], 0) / 100).toFixed(1)), returns[spec.tier - 1]);
    let boundary = 0;
    for (let i = 0; i < spec.weights.length; i++) {
      for (const value of [boundary / 10000, (boundary + spec.weights[i] - 0.001) / 10000]) {
        let first = true;
        const seeded = createRng(781 + i);
        const ticket = drawScratchTicket(spec.tier, () => { if (first) { first = false; return value; } return seeded(); });
        assert.equal(ticket.amount, spec.price * SCRATCH_MULTIPLIERS[i]);
        assert.equal(new Set(ticket.winningNumbers).size, 2);
        assert.equal(new Set(ticket.cells.map((c) => c.number)).size, 6);
        const matches = ticket.cells.filter((c) => ticket.winningNumbers.includes(c.number));
        assert.equal(matches.length, i ? 1 : 0);
        assert.equal(matches.reduce((sum, c) => sum + c.amount, 0), ticket.amount);
      }
      boundary += spec.weights[i];
    }
  }
});

test('scratch rewards: actual identity ownership, one ticket slot, repeat acquisition and distinct offers', () => {
  const h = setup();
  try {
    const ps = h.ps('p_0');
    assert.equal(grantRelic(ps, 'relic_235'), null);
    for (let seed = 1; seed <= 80; seed++) {
      const options = pickRelicChoices(7, [], createRng(seed));
      assert.ok(options.every((id) => !RELICS.find((r) => r.id === id).scratchTicket), 'an identity candidate does not unlock tickets in the same offer');
    }
    ps.relicOffer = { id: 'legal-id', round: 7, options: ['relic_234'] };
    assert.equal(selectRelic(ps, 'legal-id', 0).id, 'relic_234');
    assert.equal(grantRelic(ps, 'relic_234'), null);
    assert.ok(grantRelic(ps, 'relic_235'));
    assert.equal(grantRelic(ps, 'relic_236'), null);
    assert.equal(ps.scratchSeq, 1);
    const held = ps.scratchTicket.id;
    assert.ok(pickRelicChoices(7, ps.relics, createRng(3), { hasScratchTicket: true }).every((id) => !RELICS.find((r) => r.id === id).scratchTicket));
    ps.openScratch(held); ps.claimScratch(held);
    assert.ok(grantRelic(ps, 'relic_235'));
    assert.equal(ps.relics.filter((r) => r.id === 'relic_235').length, 1, 'journal retains a single record');
    assert.equal(ps.scratchSeq, 2);
    ps.openScratch(ps.scratchTicket.id); ps.claimScratch(ps.scratchTicket.id);
    ps.relics = RELICS.map((r) => ({ id: r.id, round: 1 }));
    const options = pickRelicChoices(7, ps.relics, createRng(2));
    assert.equal(options.length, 3); assert.equal(new Set(options).size, 3);
    assert.ok(options.every((id) => RELICS.find((r) => r.id === id).scratchTicket));
    const offer = settleRelics(ps, { perfect: true, leaked: [] }, { completed: true });
    assert.ok(selectRelic(ps, offer.id, 0));
    h.invariants();
  } finally { h.m.dispose(); }
});

test('scratch purchase/claim: payment, stats, audit, stale sequences, no client amount, duplicate claims and private result', () => {
  const h = setup({ seed: 17 });
  try {
    const ps = h.ps('p_0'); grantRelic(ps, 'relic_234'); ps.funds = 20;
    const audit = attachAudit(h.m);
    const spent = ps.stats.gold, gained = ps.stats.fundsGained;
    const shopRng = h.m.rngShop.state?.();
    assert.ok(ps.buyScratch(5, 0).ok);
    assert.equal(ps.funds, 10); assert.equal(ps.stats.gold, spent + 10);
    const ticket = structuredClone(ps.scratchTicket);
    assert.ok(ps.buyScratch(1, 1).error);
    assert.equal(ps.privateView().scratch.ticket.cells, undefined);
    assert.ok(ps.claimScratch(ticket.id).error, 'must open before claiming');
    assert.ok(ps.openScratch(ticket.id).ok); assert.ok(ps.openScratch(ticket.id).ok);
    const view = ps.privateView().scratch;
    view.ticket.cells[0].amount = 100000;
    assert.notEqual(ps.scratchTicket.cells[0].amount, 100000);
    assert.ok(ps.claimScratch(ticket.id).ok);
    assert.equal(ps.funds, 10 + ticket.amount);
    assert.equal(ps.stats.fundsGained, gained + ticket.amount);
    assert.ok(ps.claimScratch(ticket.id).ok);
    assert.equal(ps.funds, 10 + ticket.amount);
    assert.ok(ps.buyScratch(1, 0).error, 'old purchase sequence cannot charge again after claim');
    assert.ok(ps.claimScratch('foreign').error);
    assert.ok(validateC2S({ t: 'g.scratchBuy', tier: 0, seq: 0 }));
    assert.equal(validateC2S({ t: 'g.scratchClaim', ticketId: ticket.id, amount: 999 }), null, 'unknown fields never become a trusted payout');
    assert.ok(h.m.handle(ps.playerId, { t: 'g.scratchClaim', ticketId: ticket.id, amount: 999 }).ok);
    assert.equal(ps.funds, 10 + ticket.amount);
    assert.equal(h.m.rngShop.state?.(), shopRng);
    assert.deepEqual(audit.violations, []); h.invariants();
  } finally { h.m.dispose(); }
});

test('scratch lifecycle: insufficient funds, tier rounds, phase/Ready gates, cross-round and reconnect', () => {
  const h = setup();
  try {
    const ps = h.ps('p_0');
    ps.funds = 100;
    assert.ok(ps.buyScratch(1, 0).error);
    grantRelic(ps, 'relic_234');
    for (const spec of SCRATCH_TIERS) {
      h.m.round = spec.unlockRound - 1;
      assert.ok(ps.buyScratch(spec.tier, ps.scratchSeq).error);
    }
    h.m.round = 7; ps.funds = 1;
    assert.ok(ps.buyScratch(1, 0).error); assert.equal(ps.scratchSeq, 0);
    ps.funds = 20; assert.ok(ps.buyScratch(1, 0).ok);
    const ticket = structuredClone(ps.scratchTicket);
    ps.ready = true; assert.ok(ps.openScratch(ticket.id).error); ps.ready = false;
    h.m.phase = PHASE.COMBAT;
    assert.ok(ps.openScratch(ticket.id).error); assert.ok(ps.claimScratch(ticket.id).error);
    h.m.phase = PHASE.PREP; assert.ok(ps.openScratch(ticket.id).ok);
    h.m.onReconnect(ps.playerId);
    assert.deepEqual(ps.privateView().scratch.ticket.cells, ticket.cells);
    ps.endPrep(); ps.startRound(8); h.m.round = 8;
    assert.equal(ps.scratchTicket.id, ticket.id);
    const f0 = ps.funds; assert.ok(ps.claimScratch(ticket.id).ok);
    assert.equal(ps.funds, f0 + ticket.amount);
    ps.left = true; assert.ok(ps.buyScratch(1, ps.scratchSeq).error);
  } finally { h.m.dispose(); }
  const fresh = setup();
  try { assert.equal(fresh.ps('p_0').scratchTicket, null); assert.equal(fresh.ps('p_0').scratchSeq, 0); }
  finally { fresh.m.dispose(); }
});

test('scratch multiplayer ownership and automatic use on bot prep without buying', () => {
  const h = setup({ mode: 'coop', humans: 2 });
  try {
    const a = h.ps('p_0'), b = h.ps('p_1');
    grantRelic(a, 'relic_234'); grantRelic(a, 'relic_235');
    const id = a.scratchTicket.id;
    assert.ok(b.openScratch(id).error); assert.ok(b.claimScratch(id).error);
    assert.equal(b.privateView().scratch.ticket, null);
    const seq = a.scratchSeq;
    botPrepBeginSteps(h.m, a).next();
    assert.equal(a.scratchTicket, null); assert.equal(a.scratchResult.ticketId, id); assert.equal(a.scratchSeq, seq);
    assert.equal(canReceiveRelic(RELICS.find((r) => r.id === 'relic_235'), []), false);
    assert.equal(pickRelic(7, RELICS.map((r) => r.id), createRng(1), { hasScratchTicket: true }), null);
  } finally { h.m.dispose(); }
});
