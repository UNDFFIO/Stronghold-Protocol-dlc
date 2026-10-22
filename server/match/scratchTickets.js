import { createRng, deriveSeed } from '../sim/rng.js';
import { drawScratchTicket } from '../../shared/scratchTickets.js';
import { getRelic } from '../../shared/relics.js';

/** Called only after the authoritative acquisition gate. The sequence also invalidates stale purchase retries. */
export function issueScratchTicket(ps, relic, round) {
  const seq = ++ps.scratchSeq;
  const rng = createRng(deriveSeed(ps.m.seed, `scratch-ticket:${ps.seat}:${seq}`));
  ps.scratchTickets.push({ id: `scratch:${ps.m.battlePrefix}:${ps.seat}:${seq}`, relicId: relic.id,
    tier: relic.tier, round, opened: false, ...drawScratchTicket(relic.tier, rng) });
}

/** Ready/deadline keeps the oldest ticket of the highest tier, without paying discarded prizes. */
export function retainBestScratchTicket(ps) {
  if (ps.scratchTickets.length <= 1) return;
  const best = ps.scratchTickets.reduce((a, b) => b.tier > a.tier ? b : a);
  ps.scratchTickets = [best];
  ps.relics = ps.relics.filter((r) => !getRelic(r.id)?.scratchTicket || r.id === best.relicId);
}

/** Future prizes stay private to the server until the owner opens the ticket. Never expose mutable references. */
export function scratchView(ps) {
  return { seq: ps.scratchSeq, tickets: ps.scratchTickets.map((ticket) => ({
    id: ticket.id, relicId: ticket.relicId, tier: ticket.tier, round: ticket.round, opened: ticket.opened,
    ...(ticket.opened ? { winningNumbers: [...ticket.winningNumbers], cells: ticket.cells.map((c) => ({ ...c })) } : {}),
  })), lastResult: ps.scratchResult ? { ...ps.scratchResult } : null };
}
