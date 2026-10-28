// Maintainer DLC (2026-10-26): unanimous continuation after clearing Hidden Core.
import { PHASE, ERR } from '../../../shared/constants.js';
import { OK, fail } from './common.js';
import { grantNegativeRelics } from '../relics.js';

export class MatchEndless {
  openEndlessVote() {
    if (this.ended || this.endlessVote || this.endless) return;
    const survivors = this.alivePlayers().filter(p => !p.left);
    // [ASSUMED] AI seats follow the humans; eliminated players and spectators do not vote.
    const voters = survivors.filter(p => !p.isBot).map(p => p.playerId);
    if (!voters.length) { this.finish({ victory: true, hiddenCleared: true, reason: 'victory' }); return; }
    this.phase = PHASE.CONTINUE_VOTE;
    this.endlessVote = { voters, agreed: new Set() };
    // [ASSUMED] Team votes expire after 30 s; silence never counts as consent. Solo has no deadline.
    this.setDeadline(this.isSolo ? 0 : 30, () => this.declineEndless());
    this.markPublic();
  }

  declineEndless() {
    if (!this.endlessVote) return;
    this.endlessVote = null;
    this.finish({ victory: true, hiddenCleared: true, reason: 'victory' });
  }

  voteEndless(ps, agree) {
    const vote = this.endlessVote;
    if (this.phase !== PHASE.CONTINUE_VOTE || !vote) return fail(ERR.WRONG_PHASE);
    if (!ps.connected || ps.left || !ps.alive || !vote.voters.includes(ps.playerId)) return fail(ERR.NOT_IN_ROOM);
    if (!agree) { this.declineEndless(); return OK; }
    vote.agreed.add(ps.playerId);
    if (vote.voters.every(id => vote.agreed.has(id))) {
      this.setDeadline(0);
      this.endlessVote = null;
      this.endless = { startRound: this.round + 1, cleared: 0,
        winners: new Set(this.alivePlayers().filter(p => !p.left).map(p => p.playerId)) };
      this.gd.endlessStartRound = this.endless.startRound;
      for (const player of this.alivePlayers()) if (!player.left) grantNegativeRelics(player, 1);
      this.startRound(this.endless.startRound);
    }
    this.markPublic();
    return OK;
  }

  endlessFlags(flags = {}) {
    const scale = this.gd.endlessScale(this.round);
    return scale > 1 ? { ...flags, endlessEnemyScale: scale } : flags;
  }
}
