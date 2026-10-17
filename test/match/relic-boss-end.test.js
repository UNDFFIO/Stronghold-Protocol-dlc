import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE } from '../../shared/constants.js';
import { makeMatch } from './harness.js';

for (const scenario of ['no hidden boss', 'insufficient layers', 'insufficient LP', 'defeat', 'hidden victory', 'hidden defeat', 'next stage']) {
  test(`boss collectible choices: ${scenario}`, () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'HARD', fake: true });
    const { m } = h;
    try {
      const ps = h.ps('p_0');
      const hidden = scenario.startsWith('hidden ');
      const victory = !scenario.includes('defeat');
      m.round = hidden ? m.gd.hiddenRound : m.gd.bossRound;
      m.phase = hidden ? PHASE.HIDDEN_CORE : PHASE.FINAL_ASSAULT;
      m.hiddenBossId = scenario === 'no hidden boss' ? null : 'boss_1';
      m.hiddenLayerSum = scenario === 'insufficient layers' ? 0 : 9999;
      m.teamLp = scenario === 'insufficient LP' ? 1 : 50;
      m.bossPool = { hp: victory ? 0 : 100 };
      m.fields = [{ fieldId: 'b1', players: [ps.playerId], live: true }];
      m._finishFinal(hidden, () => ({ perPlayer: {
        [ps.playerId]: { perfect: true, leaked: [], killed: 0, damageDealt: 0 },
      } }));
      if (scenario === 'next stage') {
        assert.ok(ps.relicOffer);
        assert.equal(m.phase, PHASE.SETTLE);
        assert.equal(m.ended, false);
        const offer = ps.relicOffer;
        assert.deepEqual(m.pickRelicChoice(ps, offer.id, 0), { ok: true });
        assert.equal(m.hiddenReached, true);
        assert.equal(m.round, m.gd.hiddenRound);
      } else {
        assert.equal(ps.relicOffer, null);
        assert.ok(!m._relicContinue);
        h.run(() => m.ended);
        assert.equal(m.phase, PHASE.RESULT);
        assert.equal(ps.relics.length, 0);
        assert.equal(m.outcome.victory, hidden || victory);
        assert.equal(m.outcome.hiddenCleared, hidden && victory);
      }
    } finally { m.dispose(); }
  });
}
