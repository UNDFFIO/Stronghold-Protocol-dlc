import { createRng, deriveSeed } from '../sim/rng.js';
import { drawScratchTicket } from '../../shared/scratchTickets.js';

/** Called only after the authoritative acquisition gate. The sequence also invalidates stale purchase retries. */
export function issueScratchTicket(ps, relic, round) {
  const seq = ++ps.scratchSeq;
  const rng = createRng(deriveSeed(ps.m.seed, `scratch-ticket:${ps.seat}:${seq}`));
  ps.scratchTicket = { id: `scratch:${ps.m.battlePrefix}:${ps.seat}:${seq}`, relicId: relic.id,
    tier: relic.tier, round, opened: false, ...drawScratchTicket(relic.tier, rng) };
}

/** Future prizes stay private to the server until the owner opens the ticket. Never expose mutable references. */
export function scratchView(ps) {
  const ticket = ps.scratchTicket;
  return { seq: ps.scratchSeq, ticket: ticket ? {
    id: ticket.id, relicId: ticket.relicId, tier: ticket.tier, round: ticket.round, opened: ticket.opened,
    ...(ticket.opened ? { winningNumbers: [...ticket.winningNumbers], cells: ticket.cells.map((c) => ({ ...c })) } : {}),
  } : null, lastResult: ps.scratchResult ? { ...ps.scratchResult } : null };
}
