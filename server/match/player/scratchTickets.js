import { ERR } from '../../../shared/constants.js';
import { scratchTier } from '../../../shared/scratchTickets.js';
import { grantRelic } from '../relics.js';
import { OK, fail } from './common.js';

export class PlayerScratchTickets {
  buyScratch(tier, seq) {
    const gate = this._gate(); if (gate) return gate;
    const spec = scratchTier(tier);
    if (this.left || !spec || !Number.isInteger(seq) || seq !== this.scratchSeq
      || this.scratchTicket || !this.relics.some((r) => r.id === 'relic_234')
      || this.m.round < spec.unlockRound) return fail(ERR.BAD_TARGET);
    if (this.funds < spec.price) return fail(ERR.NO_FUNDS);
    this.spend(spec.price);
    grantRelic(this, spec.relicId);
    this._afterSpend(spec.price, 'scratch-ticket');
    return OK;
  }

  openScratch(ticketId) {
    const gate = this._gate(); if (gate) return gate;
    const ticket = this.scratchTicket;
    if (this.left || !ticket || ticket.id !== ticketId) return fail(ERR.BAD_TARGET);
    ticket.opened = true;
    this.dirty();
    return OK;
  }

  claimScratch(ticketId) {
    const gate = this._gate(); if (gate) return gate;
    if (this.left) return fail(ERR.BAD_TARGET);
    if (this.scratchResult?.ticketId === ticketId) return OK;
    const ticket = this.scratchTicket;
    if (!ticket || ticket.id !== ticketId || !ticket.opened) return fail(ERR.BAD_TARGET);
    // Consume before crediting: retries and effect hooks cannot pay the same ticket twice.
    this.scratchTicket = null;
    this.relics = this.relics.filter((r) => r.id !== ticket.relicId);
    this.scratchResult = { ticketId, relicId: ticket.relicId, amount: ticket.amount, round: this.m.round };
    this.addFunds(ticket.amount, { reason: 'scratch-ticket' });
    this.dirty();
    return OK;
  }
}
