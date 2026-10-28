import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RELIC_TIERS } from '../../shared/relics.js';
import { createRng } from '../../server/sim/rng.js';

// Exercise a real negative-quality definition without adding an unrequested collectible to the catalogue.
const url = new URL('../../shared/relics.js', import.meta.url);
const source = (await readFile(url, 'utf8'))
  .replace("'./i18n.js'", JSON.stringify(new URL('./i18n.js', url).href))
  .replace("relic('158', N_('时间机器'), 1,", "relic('158', N_('时间机器'), 6,");
const fixture = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('negative quality is immutable and excluded from all random reward pools, even with explicit weights', () => {
  const tier = RELIC_TIERS.find((t) => t.name === '负面');
  assert.ok(Object.isFrozen(tier));
  assert.equal(tier.normalDrop, false);
  assert.equal(tier.unlockRound, null);
  const negative = fixture.getRelic('relic_158');
  assert.equal(negative.tier, tier.tier);
  assert.equal(fixture.canReceiveRelic(negative, []), true, 'direct scripted grants remain possible');
  const owned = fixture.RELICS.filter((r) => r.id !== negative.id).map((r) => r.id);
  for (const round of [1, 3, 4, 7, 9, 12, 15, 100]) {
    for (const options of [
      {},
      { tierWeights: [5, 65, 30, 0, 0] },
      { tierWeights: [0, 0, 0, 0, 100] },
      { tierWeights: [0, 0, 0, 0, 0, 100] },
    ]) {
      const rng = createRng(round);
      assert.equal(fixture.pickRelic(round, owned, rng, { ...options, hasScratchTicket: true }), null);
      for (let i = 0; i < 100; i++) {
        assert.notEqual(fixture.pickRelic(round, [], rng, options)?.id, negative.id);
      }
    }
    {
      assert.deepEqual(fixture.pickRelicChoices(round, owned, createRng(round), { hasScratchTicket: true }), ['relic_014', 'relic_014', 'relic_014']);
    }
  }
});

test('negative quality uses a red accent shared by collection cards and icon badges', async () => {
  const css = await readFile(new URL('../../public/css/screens/game-panels.css', import.meta.url), 'utf8');
  assert.match(css, /\.relic-tier-6\s*\{\s*--relic-tone:\s*#ff6464;/);
});
