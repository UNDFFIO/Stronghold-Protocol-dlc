import { ERR } from '../../../shared/constants.js';
import { scratchTier } from '../../../shared/scratchTickets.js';
import { canReceiveRelic, getRelic } from '../../../shared/relics.js';
import { grantRelic } from '../relics.js';
import { OK, fail } from './common.js';

export class PlayerScratchTickets {
  buyScratch(tier, seq) {
    const gate = this._gate(); if (gate) return gate;
    const spec = scratchTier(tier);
    if (this.left || !spec || !Number.isInteger(seq) || seq !== this.scratchSeq
      || !this.relics.some((r) => r.id === 'relic_234')
      || this.m.round < spec.unlockRound
      || !canReceiveRelic(getRelic(spec.relicId), this.relics, { extraRound: this.m.gd.endlessRound(this.m.round) })) return fail(ERR.BAD_TARGET);
    if (this.funds < spec.price) return fail(ERR.NO_FUNDS);
    this.spend(spec.price);
    grantRelic(this, spec.relicId);
    this._afterSpend(spec.price, 'scratch-ticket');
    return OK;
  }

  openScratch(ticketId) {
    const gate = this._gate(); if (gate) return gate;
    const ticket = this.scratchTickets.find((t) => t.id === ticketId);
    if (this.left || !ticket || ticket.id !== ticketId) return fail(ERR.BAD_TARGET);
    ticket.opened = true;
    this.dirty();
    return OK;
  }

  claimScratch(ticketId) {
    const gate = this._gate(); if (gate) return gate;
    if (this.left) return fail(ERR.BAD_TARGET);
    if (this.scratchResult?.ticketId === ticketId) return OK;
    const ticket = this.scratchTickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.id !== ticketId || !ticket.opened) return fail(ERR.BAD_TARGET);
    // Consume before crediting: retries and effect hooks cannot pay the same ticket twice.
    this.scratchTickets = this.scratchTickets.filter((t) => t.id !== ticketId);
    if (!this.scratchTickets.some((t) => t.relicId === ticket.relicId)) {
      this.relics = this.relics.filter((r) => r.id !== ticket.relicId);
    }
    this.scratchResult = { ticketId, relicId: ticket.relicId, amount: ticket.amount, round: this.m.round };
    this.addFunds(ticket.amount, { reason: 'scratch-ticket' });
    this.dirty();
    return OK;
  }
}
