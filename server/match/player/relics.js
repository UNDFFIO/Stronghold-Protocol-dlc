// PlayerState methods for restoring an eliminated roster and delivering DLC revival supplies.
// Installed on PlayerState.prototype by ../PlayerState.js.

import { PHASE, ERR } from '../../../shared/constants.js';
import { DEATH_NOTE_ID, deathNoteCost, resolveDeathNoteName } from '../deathNote.js';
import { OK, fail } from './common.js';
import { freeSlot } from '../board.js';

export class PlayerRelics {
  tradeShinigamiEyes(round) {
    const gate = this._gate(); if (gate) return gate;
    if (this.left || round !== this.m.round || this.shinigamiEyes
      || !this.relics.some((r) => r.id === DEATH_NOTE_ID)) return fail(ERR.BAD_TARGET);
    const pooled = this.m.teamLp != null;
    if (pooled) this.m._syncTeamLp();
    if (!Number.isFinite(this.lp) || this.lp <= 0) return fail(ERR.BAD_TARGET);
    // [ASSUMED] Current LP, once per match; round the remaining half up (1 LP stays 1).
    // This is a voluntary price, not combat damage: shields, damage hooks and battle rewards do not apply.
    const loss = Math.floor(this.lp / 2);
    this.shinigamiEyes = true;
    this.lp -= loss;
    if (pooled) {
      this.m.teamLp = Math.max(0, this.m.teamLp - loss);
      // Preserve everyone's actual share when the next flush synchronizes the existing boss pool.
      for (const ps of this.m.alivePlayers()) ps.lpAtFinal = Math.max(0, ps.lp);
    }
    this.dirty();
    return OK;
  }

  writeDeathNote(name, round) {
    const gate = this._gate(); if (gate) return gate;
    if (this.left || round !== this.m.round || typeof name !== 'string' || !name.trim() || name.length > 128
      || !this.relics.some((r) => r.id === DEATH_NOTE_ID)
      || this.deathNoteEntry?.round === this.m.round) return fail(ERR.BAD_TARGET);
    const cost = deathNoteCost(this);
    if (this.funds < cost) return fail(ERR.NO_FUNDS);
    const enemyKeys = resolveDeathNoteName(this.m, name);
    this.spend(cost);
    // Reserve the use before dispatching hooks: concurrent/retried requests cannot spend or write twice.
    this.deathNoteEntry = { round: this.m.round, enemyKeys };
    this.dirty();
    // Every player's preview and existing prep scouts share this round's removals.
    if (enemyKeys.length) for (const ps of this.m.alivePlayers()) ps.dirty();
    this._afterSpend(cost, 'death-note');
    // No correctness feedback: an attempted spelling cannot probe hidden enemy names for free.
    return OK;
  }

  restoreEliminatedRoster() {
    const saved = this.eliminatedRoster;
    if (!saved) return;
    this.board = saved.board;
    this.hand = saved.hand;
    this.temp = saved.temp;
    this.relicChessQueue = saved.queue;
    this.eliminatedRoster = null;
    for (const p of this.allChess()) p.poolCopies = this.poolOf(this.gd.baseIdOf(p.id)).take(this.gd.baseIdOf(p.id), saved.copies.get(p.uid) || 0, { overdraw: true });
    // 死亡期间错过的整备不销毁还原的临时区物件，重新给一次完整处理机会。
    this._tempDue.clear();
    for (let i = 0; i < this.temp.length; i++) if (this.temp[i]) this._putTemp(i, this.temp[i]);
    this.invalidateDeployMap();
  }

  drainRelicChess() {
    if (this._drainingRelicChess || !this.alive || this.left || this.ready || this.m.phase !== PHASE.PREP) return;
    this._drainingRelicChess = true;
    try {
      while (this.relicChessQueue.length) { // loop-cap: finite supply queue, shifted each iteration or stopped on failure
        const id = this.relicChessQueue[0];
        if (freeSlot(this.hand) < 0 && freeSlot(this.temp) < 0 && !this.completesChessMerge(id)) break;
        this.relicChessQueue.shift();
        if (!this.acquireChess(id, { source: 'relic-revive' })) { this.relicChessQueue.unshift(id); break; }
      }
    } finally { this._drainingRelicChess = false; }
  }
}
