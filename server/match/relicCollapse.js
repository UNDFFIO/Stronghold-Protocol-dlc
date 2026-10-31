import { buildDeployMap } from './board.js';
import { createRng, deriveSeed } from '../sim/rng.js';

/** Owner-only deployment restrictions; boss rounds ignore even an old normal-round list. */
export function activeCollapseTiles(ps) {
  return ps.collapseRound === ps.m.round && !ps.m.gd.isBossRound(ps.m.round)
    && ps.relics.some((r) => r.id === 'relic_239') ? ps.collapseTiles || [] : [];
}

export function collapseTileCount(stage) {
  if (stage?.id === 'act1autochess_m04' || stage?.id === 'act2autochess_m01') return 3;
  return stage?.id === 'act2autochess_m04' ? 5 : 4;
}

/** Sample before PREP is published. Independent RNG keeps shops and waves unchanged.
 * [ASSUMED] Adjacent rounds may overlap, but cannot have an identical set when alternatives exist. */
export function prepareCollapseTiles(ps) {
  if (ps.collapseRound === ps.m.round) return;
  const previous = new Set(ps.collapseTiles || []);
  ps.collapseRound = ps.m.round;
  ps.collapseTiles = [];
  if (!ps.m.gd.isBossRound(ps.m.round) && ps.relics.some((r) => r.id === 'relic_239')) {
    const bag = [...buildDeployMap(ps.m.stage, {
      deviceOverrides: ps.deviceOverrides, tileOverrides: ps.tileOverrides,
    }).keys()].sort();
    const count = Math.min(collapseTileCount(ps.m.stage), bag.length);
    const rng = createRng(deriveSeed(ps.m.seed, `collapse:${ps.seat}:${ps.m.round}`));
    for (let i = 0; i < count; i++) ps.collapseTiles.push(bag.splice(rng.int(bag.length), 1)[0]);
    if (bag.length && count && previous.size === count && ps.collapseTiles.every((k) => previous.has(k))) {
      ps.collapseTiles[rng.int(count)] = bag[rng.int(bag.length)];
    }
    ps.collapseTiles.sort();
  }
  ps.invalidateDeployMap();
}
