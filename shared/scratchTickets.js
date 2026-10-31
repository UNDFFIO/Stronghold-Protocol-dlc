// Maintainer-defined, independent per-ticket prize tables. Weights are integers out of 10,000.
export const SCRATCH_MULTIPLIERS = Object.freeze([0, 1, 2, 5, 10, 50]);
/** @type {[number, number, number[]][]} */
const TIER_ROWS = [
  [2, 1, [6000, 2700, 1000, 270, 28, 2]],
  [4, 1, [5800, 2700, 1150, 310, 37, 3]],
  [6, 4, [5600, 2700, 1300, 350, 46, 4]],
  [8, 7, [5400, 2700, 1450, 390, 55, 5]],
  [10, 7, [5200, 2700, 1600, 430, 64, 6]],
];
export const SCRATCH_TIERS = Object.freeze(TIER_ROWS.map(([price, unlockRound, weights], i) => Object.freeze({ tier: i + 1, relicId: `relic_${i === 4 ? 243 : 235 + i}`,
  price, unlockRound, weights: Object.freeze(weights) })));

export const scratchTier = (tier) => SCRATCH_TIERS.find((t) => t.tier === tier) ?? null;

/** A winning ticket has exactly one matching number; decoys never introduce another win. */
export function drawScratchTicket(tier, rng) {
  const spec = scratchTier(tier);
  if (!spec) return null;
  let roll = Math.floor(rng() * 10000), index = 0;
  while (index < spec.weights.length - 1 && roll >= spec.weights[index]) roll -= spec.weights[index++];
  const amount = spec.price * SCRATCH_MULTIPLIERS[index];
  const bag = Array.from({ length: 99 }, (_, i) => i + 1);
  const take = () => bag.splice(Math.floor(rng() * bag.length), 1)[0];
  const winningNumbers = [take(), take()];
  const match = amount > 0 ? Math.floor(rng() * 6) : -1;
  const cells = Array.from({ length: 6 }, (_, i) => ({
    number: i === match ? winningNumbers[Math.floor(rng() * 2)] : take(),
    amount: i === match ? amount : spec.price * SCRATCH_MULTIPLIERS[1 + Math.floor(rng() * 5)],
  }));
  return { amount, winningNumbers, cells };
}
